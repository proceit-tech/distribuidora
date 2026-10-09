-- =====================================================================
-- NEX-005 — Clientes
-- Clientes, contactos, direcciones y documentos (+ asignación de código CLI-nnnnnn).
-- Proyecto Nexit (REQ NEXIT-2026-001). ESTADO: PROPUESTA para revisión técnica.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- =====================================================================

CREATE TABLE clientes (
  id                              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),                
  empresa_id                      uuid          NOT NULL REFERENCES empresas (id),                   
  
  
  codigo                            varchar(50)   NOT NULL,
  
  naturaleza_receptor           smallint      NOT NULL CHECK (naturaleza_receptor IN (1, 2)),     
  tipo_operacion             smallint      NOT NULL CHECK (tipo_operacion IN (1, 2, 3, 4)), 
  tipo_persona                     text          NOT NULL CHECK (tipo_persona IN ('JURIDICA', 'FISICA')), 
  
  
  tipo_contribuyente_sifen              smallint      NOT NULL CHECK (tipo_contribuyente_sifen IN (1, 2)),
  pais_codigo                    text          NOT NULL REFERENCES referencia_geografica_paises (codigo),             
  tipo_documento                   varchar(30)   NOT NULL CHECK (tipo_documento IN
                                    ('RUC', 'CEDULA_PARAGUAYA', 'PASAPORTE', 'CEDULA_EXTRANJERA',
                                     'CARNET_RESIDENCIA', 'INNOMINADO', 'TARJETA_DIPLOMATICA', 'OTRO')), 
  tipo_documento_identidad_sifen     smallint      CHECK (tipo_documento_identidad_sifen IN (1, 2, 3, 4, 5, 6, 9)), 
  descripcion_documento_identidad   varchar(100),                                                       
  numero_documento                          varchar(30)   NOT NULL CHECK (length(btrim(numero_documento)) > 0),           
  dv              varchar(5),                                                         
  razon_social                      varchar(200)  NOT NULL CHECK (length(btrim(razon_social)) > 0),       
  nombre_fantasia                      varchar(200),                                                       
  email                           varchar(150)  CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),         
  email_copia                        varchar(150)  CHECK (email_copia ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),      
  telefono                           varchar(30),                                                        
  celular                    varchar(30),                                                        
  
  
  
  limite_credito                    numeric(18,4) NOT NULL DEFAULT 0 CHECK (limite_credito >= 0),         
  limite_credito_temporal          numeric(18,4) CHECK (limite_credito_temporal >= 0),                  
  fecha_vencimiento_credito     date,                                                               
  
  grupo_cliente_id               uuid,                                                               
  condicion_pago_id                 uuid,                                                               
  moneda_codigo_predeterminada           text          REFERENCES monedas (codigo),                         
  lista_precio_id                   uuid,                                                               
  canal_venta_id                uuid,                                                               
  vendedor_id                  uuid,                                                               
  codigo_externo                   varchar(100),                                                       
  gln                             varchar(13),                                                        
  descuento_comercial_pct         numeric(5,2)  NOT NULL DEFAULT 0 CHECK (descuento_comercial_pct >= 0 AND descuento_comercial_pct <= 100), 
  
  bloqueado_ventas                boolean       NOT NULL DEFAULT false,                               
  motivo_bloqueo_ventas              varchar(500),                                                       
  bloqueado_ventas_at                timestamptz,                                                        
  bloqueado_ventas_por                uuid,                                                               
  dia_preferido_cobro        smallint      CHECK (dia_preferido_cobro BETWEEN 1 AND 31),    
  requiere_orden_compra         boolean       NOT NULL DEFAULT false,                               
  email_facturacion                   varchar(150)  CHECK (email_facturacion ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'), 
  email_cobranzas               varchar(150)  CHECK (email_cobranzas ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'), 
  recibe_documento_electronico   boolean       NOT NULL DEFAULT true,                                
  
  ruta_entrega_id               uuid,                                                               
  zona_comercial_id              uuid,                                                               
  
  frecuencia_entrega              text          CHECK (frecuencia_entrega IN ('DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'A_DEMANDA')),
  
  
  
  dias_entrega                   smallint[]    CHECK (dias_entrega IS NULL OR
                                    (cardinality(dias_entrega) BETWEEN 1 AND 7
                                     AND dias_entrega <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[])),
  observacion_comercial                varchar(1000),                                                      
  observacion_logistica                 varchar(1000),                                                      
  activo                       boolean       NOT NULL DEFAULT true,                                
  creado_at                      timestamptz   NOT NULL DEFAULT now(),                               
  actualizado_at                      timestamptz   NOT NULL DEFAULT now(),                               
  creado_por                      uuid,                                                               

  CONSTRAINT clientes_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT clientes_empresa_codigo_key  UNIQUE (empresa_id, codigo),                                  
  CONSTRAINT clientes_empresa_external_codigo_key UNIQUE (empresa_id, codigo_externo),                 

  
  CONSTRAINT clientes_cliente_grupo_fk FOREIGN KEY (empresa_id, grupo_cliente_id) REFERENCES grupos_cliente (empresa_id, id),
  CONSTRAINT clientes_pago_condicion_fk   FOREIGN KEY (condicion_pago_id) REFERENCES condiciones_pago (id),
  CONSTRAINT clientes_sales_channel_fk  FOREIGN KEY (empresa_id, canal_venta_id)  REFERENCES canales_venta (empresa_id, id),
  CONSTRAINT clientes_vendedor_fk    FOREIGN KEY (empresa_id, vendedor_id)    REFERENCES vendedores (empresa_id, id),
  CONSTRAINT clientes_entrega_ruta_fk FOREIGN KEY (empresa_id, ruta_entrega_id) REFERENCES rutas_entrega (empresa_id, id),
  CONSTRAINT clientes_commercial_zone_fk FOREIGN KEY (empresa_id, zona_comercial_id) REFERENCES zonas_comerciales (empresa_id, id),
  CONSTRAINT clientes_sales_blocked_por_fk FOREIGN KEY (empresa_id, bloqueado_ventas_por) REFERENCES usuarios (empresa_id, id),
  CONSTRAINT clientes_creado_por_fk     FOREIGN KEY (empresa_id, creado_por)        REFERENCES usuarios (empresa_id, id),

  
  
  CONSTRAINT clientes_taxpayer_tipo_chk CHECK (
    (tipo_persona = 'FISICA' AND tipo_contribuyente_sifen = 1) OR (tipo_persona = 'JURIDICA' AND tipo_contribuyente_sifen = 2)),
  
  CONSTRAINT clientes_contributor_chk CHECK (
    naturaleza_receptor <> 1 OR
    (tipo_documento = 'RUC' AND dv IS NOT NULL AND length(btrim(dv)) > 0
     AND tipo_documento_identidad_sifen IS NULL AND descripcion_documento_identidad IS NULL)),
  
  CONSTRAINT clientes_noncontributor_chk CHECK (
    naturaleza_receptor <> 2 OR
    (tipo_documento <> 'RUC' AND dv IS NULL
     AND tipo_documento_identidad_sifen IS NOT NULL
     AND tipo_documento_identidad_sifen = CASE tipo_documento
         WHEN 'CEDULA_PARAGUAYA' THEN 1 WHEN 'PASAPORTE' THEN 2 WHEN 'CEDULA_EXTRANJERA' THEN 3
         WHEN 'CARNET_RESIDENCIA' THEN 4 WHEN 'INNOMINADO' THEN 5 WHEN 'TARJETA_DIPLOMATICA' THEN 6
         WHEN 'OTRO' THEN 9 END)),
  
  CONSTRAINT clientes_other_doc_description_chk CHECK (
    tipo_documento <> 'OTRO' OR (descripcion_documento_identidad IS NOT NULL AND length(btrim(descripcion_documento_identidad)) > 0)),
  
  CONSTRAINT clientes_temp_credit_chk CHECK (fecha_vencimiento_credito IS NULL OR limite_credito_temporal IS NOT NULL),
  
  
  CONSTRAINT clientes_bloquear_reason_chk CHECK (
    NOT bloqueado_ventas OR (motivo_bloqueo_ventas IS NOT NULL AND length(btrim(motivo_bloqueo_ventas)) > 0)),
  CONSTRAINT clientes_bloquear_audit_chk CHECK (
    bloqueado_ventas OR (bloqueado_ventas_at IS NULL AND bloqueado_ventas_por IS NULL))
);

CREATE UNIQUE INDEX clientes_empresa_identificacion_key
  ON clientes (empresa_id, tipo_documento, numero_documento, coalesce(dv, ''))
  WHERE tipo_documento <> 'INNOMINADO';

CREATE INDEX clientes_empresa_nombre_idx   ON clientes (empresa_id, razon_social);

CREATE INDEX clientes_empresa_activo_idx ON clientes (empresa_id, activo);

CREATE INDEX clientes_grupo_idx          ON clientes (empresa_id, grupo_cliente_id)  WHERE grupo_cliente_id IS NOT NULL;

CREATE INDEX clientes_vendedor_idx    ON clientes (empresa_id, vendedor_id)     WHERE vendedor_id IS NOT NULL;

CREATE INDEX clientes_precio_lista_idx     ON clientes (empresa_id, lista_precio_id)      WHERE lista_precio_id IS NOT NULL;

CREATE OR REPLACE FUNCTION clientes_asignar_codigo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('customers.code:' || coalesce(NEW.empresa_id::text, ''), 0));
    SELECT 'CLI-' || lpad((coalesce(max(substring(c.codigo FROM '^CLI-([0-9]+)$')::bigint), 0) + 1)::text, 6, '0')
      INTO NEW.codigo
      FROM clientes c
     WHERE c.empresa_id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER clientes_asignar_codigo_trg
  BEFORE INSERT ON clientes
  FOR EACH ROW EXECUTE FUNCTION clientes_asignar_codigo();

CREATE TABLE cliente_contactos (
  id                            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),           
  empresa_id                    uuid         NOT NULL REFERENCES empresas (id),              
  cliente_id                   uuid         NOT NULL,                                        
  nombre                    varchar(100) NOT NULL CHECK (length(btrim(nombre)) > 0),  
  apellido                     varchar(100),                                                 
  cargo                     varchar(100),                                                 
  departamento                    varchar(100),                                                 
  telefono                         varchar(30),                                                  
  celular                  varchar(30),                                                  
  email                         varchar(150) CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),    
  es_principal                    boolean      NOT NULL DEFAULT false,                          
  recibe_pedidos               boolean      NOT NULL DEFAULT false,                          
  recibe_facturacion             boolean      NOT NULL DEFAULT false,                          
  recibe_cobranzas          boolean      NOT NULL DEFAULT false,                          
  recibe_documentos_electronicos boolean      NOT NULL DEFAULT false,                          
  recibe_notificaciones        boolean      NOT NULL DEFAULT true,                           
  creado_at                    timestamptz  NOT NULL DEFAULT now(),
  actualizado_at                    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT cliente_contactos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT cliente_contactos_cliente_fk FOREIGN KEY (empresa_id, cliente_id) REFERENCES clientes (empresa_id, id)  
);

CREATE INDEX cliente_contactos_cliente_idx ON cliente_contactos (empresa_id, cliente_id);

CREATE UNIQUE INDEX cliente_contactos_uno_principal_key ON cliente_contactos (empresa_id, cliente_id) WHERE es_principal;

CREATE TABLE direcciones_cliente (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),                
  empresa_id              uuid          NOT NULL REFERENCES empresas (id),                   
  cliente_id             uuid          NOT NULL,                                             
  descripcion             varchar(100),                                                         
  tipo           text          NOT NULL DEFAULT 'COMERCIAL'
                                       CHECK (tipo IN ('FISCAL', 'COMERCIAL', 'ENTREGA', 'SUCURSAL', 'OTRA')), 
  etiqueta                   varchar(100),                                                         
  direccion                  varchar(300)  NOT NULL CHECK (length(btrim(direccion)) > 0),             
  numero_casa            varchar(20),                                                          
  complemento           varchar(200),                                                         
  pais_codigo            text          NOT NULL REFERENCES referencia_geografica_paises (codigo),               
  departamento_codigo         integer,                                                              
  distrito_codigo           integer,                                                              
  ciudad_codigo               integer,                                                              
  
  
  
  departamento         varchar(100),
  distrito           varchar(100),
  ciudad               varchar(100),
  codigo_postal             varchar(15),                                                          
  contacto_nombre  varchar(200),                                                         
  contacto_telefono varchar(30),                                                          
  horario_recepcion         varchar(200),                                                         
  observacion                   varchar(500),                                                         
  es_fiscal               boolean       NOT NULL DEFAULT false,                                 
  es_entrega_default     boolean       NOT NULL DEFAULT false,                                 
  
  latitud                numeric(9,6)  CHECK (latitud  BETWEEN -90  AND 90),
  longitud               numeric(9,6)  CHECK (longitud BETWEEN -180 AND 180),
  creado_at              timestamptz   NOT NULL DEFAULT now(),
  actualizado_at              timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT direcciones_cliente_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT direcciones_cliente_cliente_fk FOREIGN KEY (empresa_id, cliente_id) REFERENCES clientes (empresa_id, id),
  
  
  
  CONSTRAINT direcciones_cliente_geo_fk FOREIGN KEY (departamento_codigo, distrito_codigo, ciudad_codigo)
    REFERENCES referencia_geografica_ciudades (departamento_codigo, distrito_codigo, codigo) MATCH FULL,
  
  CONSTRAINT direcciones_cliente_pry_geo_chk CHECK (
    pais_codigo <> 'PRY' OR (departamento_codigo IS NOT NULL AND distrito_codigo IS NOT NULL AND ciudad_codigo IS NOT NULL)),
  
  CONSTRAINT direcciones_cliente_fiscal_chk CHECK (tipo <> 'FISCAL' OR es_fiscal)
);

CREATE INDEX direcciones_cliente_cliente_idx ON direcciones_cliente (empresa_id, cliente_id);

CREATE UNIQUE INDEX direcciones_cliente_uno_fiscal_key  ON direcciones_cliente (empresa_id, cliente_id) WHERE es_fiscal;

CREATE UNIQUE INDEX direcciones_cliente_uno_defecto_entrega_key ON direcciones_cliente (empresa_id, cliente_id) WHERE es_entrega_default;

CREATE TABLE cliente_documentos (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),                            
  empresa_id    uuid         NOT NULL REFERENCES empresas (id),                               
  cliente_id   uuid         NOT NULL,                                                         
  tipo text         NOT NULL DEFAULT 'OTRO'
                             CHECK (tipo IN ('RUC', 'CONTRATO', 'CREDITO', 'EXONERACION', 'OTRO')), 
  nombre_archivo     varchar(255) NOT NULL CHECK (length(btrim(nombre_archivo)) > 0),                    
  
  
  url_archivo      text         NOT NULL CHECK (length(btrim(url_archivo)) > 0),
  fecha_emision     date,                                                                          
  fecha_vencimiento    date,                                                                          
  observacion         varchar(500),                                                                  
  cargado_por   uuid,                                                                          
  creado_at    timestamptz  NOT NULL DEFAULT now(),                                           
  actualizado_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT cliente_documentos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT cliente_documentos_cliente_fk    FOREIGN KEY (empresa_id, cliente_id) REFERENCES clientes (empresa_id, id),
  CONSTRAINT cliente_documentos_uploaded_por_fk FOREIGN KEY (empresa_id, cargado_por) REFERENCES usuarios (empresa_id, id),
  
  CONSTRAINT cliente_documentos_dates_chk CHECK (fecha_emision IS NULL OR fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_emision)
);

CREATE INDEX cliente_documentos_cliente_idx ON cliente_documentos (empresa_id, cliente_id);

-- pais_nombre: el código desplegado lo escribe en clientes y direcciones_cliente

ALTER TABLE clientes ADD COLUMN pais_nombre text;
ALTER TABLE direcciones_cliente ADD COLUMN pais_nombre text;
CREATE TRIGGER clientes_pais_nombre_trg BEFORE INSERT OR UPDATE OF pais_codigo ON clientes FOR EACH ROW EXECUTE FUNCTION nex_completar_pais_nombre();
CREATE TRIGGER direcciones_cliente_pais_nombre_trg BEFORE INSERT OR UPDATE OF pais_codigo ON direcciones_cliente FOR EACH ROW EXECUTE FUNCTION nex_completar_pais_nombre();
SELECT nex_instalar_heredar_empresa('cliente_contactos','clientes','cliente_id');
SELECT nex_instalar_heredar_empresa('direcciones_cliente','clientes','cliente_id');
SELECT nex_instalar_heredar_empresa('cliente_documentos','clientes','cliente_id');

SELECT nex_instalar_triggers_actualizacion();
