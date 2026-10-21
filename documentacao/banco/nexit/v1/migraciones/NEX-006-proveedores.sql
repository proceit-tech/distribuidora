-- =====================================================================
-- NEX-006 — Proveedores
-- Proveedores, contactos, direcciones, cuentas bancarias, retenciones y documentos.
-- Proyecto Nexit (REQ NEXIT-2026-001). ESTADO: V1 candidata oficial — pendiente de auditoría (ChatGPT) y aprobación del responsable.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- =====================================================================

CREATE TABLE proveedores (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),   
  empresa_id                uuid        NOT NULL REFERENCES empresas (id),       
  codigo                      text,           
  tipo_persona               text        NOT NULL DEFAULT 'JURIDICA'
                                        CONSTRAINT proveedores_person_tipo_chk CHECK (tipo_persona IN ('JURIDICA','FISICA')),  
  grupo_proveedor_id         uuid,           
  tipo_documento               text        NOT NULL DEFAULT 'RUC'                   
                                        CONSTRAINT proveedores_impuesto_id_tipo_chk CHECK (tipo_documento = upper(tipo_documento) AND char_length(tipo_documento) BETWEEN 1 AND 30),
                                        
  numero_documento                    text        NOT NULL                                  
                                        CONSTRAINT proveedores_impuesto_id_chk CHECK (char_length(numero_documento) BETWEEN 1 AND 50 AND numero_documento !~ '[[:space:]]'),
  dv        text        CONSTRAINT proveedores_dv_chk CHECK (dv ~ '^[0-9]$'),  
  razon_social                text        NOT NULL CONSTRAINT proveedores_legal_nombre_chk CHECK (length(btrim(razon_social)) > 0 AND char_length(razon_social) <= 200),  
  nombre_fantasia                text        CONSTRAINT proveedores_trade_nombre_chk CHECK (char_length(nombre_fantasia) <= 200),   
  pais_codigo              text        NOT NULL DEFAULT 'PRY'                    
                                        CONSTRAINT proveedores_pais_codigo_chk CHECK (pais_codigo ~ '^[A-Z]{3}$'),
                                        
  email                     text        CONSTRAINT proveedores_email_chk CHECK (char_length(email) <= 150 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),   
  telefono                     text        CONSTRAINT proveedores_phone_chk CHECK (char_length(telefono) <= 50),     
  sitio_web                   text        CONSTRAINT proveedores_website_chk CHECK (char_length(sitio_web) <= 300 AND sitio_web ~* '^https?://[^[:space:]]+$'),  
  condicion_pago_id           uuid,           
  moneda_codigo_predeterminada     text        CONSTRAINT proveedores_moneda_fk REFERENCES monedas (codigo),        
  medio_pago_preferido_id uuid,  
  dia_pago_preferido     integer     CONSTRAINT proveedores_pay_day_chk CHECK (dia_pago_preferido BETWEEN 1 AND 31),  
  plazo_entrega_dias            integer     CONSTRAINT proveedores_lead_hora_chk CHECK (plazo_entrega_dias >= 0),      
  descuento_comercial_pct   numeric(5,2) NOT NULL DEFAULT 0                       
                                        CONSTRAINT proveedores_discount_chk CHECK (descuento_comercial_pct BETWEEN 0 AND 100),
  monto_minimo_compra   numeric(18,2) NOT NULL DEFAULT 0                      
                                        CONSTRAINT proveedores_min_amount_chk CHECK (monto_minimo_compra >= 0),
  permite_anticipos           boolean     NOT NULL DEFAULT false,   
  requiere_orden_compra   boolean     NOT NULL DEFAULT false,   
  email_pagos            text        CONSTRAINT proveedores_pay_email_chk CHECK (char_length(email_pagos) <= 150 AND email_pagos ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),  
  fecha_inicio_relacion   date,       
  fecha_fin_relacion     date,       
  estado_homologacion       text        NOT NULL DEFAULT 'PENDIENTE'
                                        CONSTRAINT proveedores_homologation_chk CHECK (estado_homologacion IN ('PENDIENTE','EN_EVALUACION','HOMOLOGADO','RECHAZADO','SUSPENDIDO','VENCIDO')),  
  fecha_homologacion         date,       
  fecha_vencimiento_homologacion  date,       
  nivel_riesgo                text        NOT NULL DEFAULT 'NO_EVALUADO'
                                        CONSTRAINT proveedores_risk_chk CHECK (nivel_riesgo IN ('NO_EVALUADO','BAJO','MEDIO','ALTO','CRITICO')),   
  calificacion_actual            numeric(5,2) CONSTRAINT proveedores_rating_chk CHECK (calificacion_actual BETWEEN 0 AND 100),  
  incoterm_codigo             text        CONSTRAINT proveedores_incoterm_fk REFERENCES incoterms (codigo),          
  condicion_entrega            text        CONSTRAINT proveedores_entrega_condicion_chk CHECK (char_length(condicion_entrega) <= 500),   
  metodo_transporte_preferido text       CONSTRAINT proveedores_transport_chk CHECK (metodo_transporte_preferido IN ('TERRESTRE','MARITIMO','AEREO','FERROVIARIO','MULTIMODAL','OTRO')),  
  dias_confirmacion_pedido   integer     CONSTRAINT proveedores_confirm_days_chk CHECK (dias_confirmacion_pedido >= 0),   
  permite_entrega_parcial   boolean     NOT NULL DEFAULT true,    
  observacion                     text        CONSTRAINT proveedores_notes_chk CHECK (char_length(observacion) <= 2000),   
  activo                 boolean     NOT NULL DEFAULT true,    
  bloqueado                boolean     NOT NULL DEFAULT false,   
  motivo_bloqueo              text,       
  creado_por                uuid,       
  creado_at                timestamptz NOT NULL DEFAULT now(),       
  actualizado_at                timestamptz NOT NULL DEFAULT now(),       
  CONSTRAINT proveedores_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT proveedores_empresa_codigo_key  UNIQUE (empresa_id, codigo),  
  CONSTRAINT proveedores_empresa_documento_key UNIQUE (empresa_id, tipo_documento, numero_documento),  
  CONSTRAINT proveedores_grupo_fk       FOREIGN KEY (empresa_id, grupo_proveedor_id) REFERENCES grupos_proveedor (empresa_id, id),
  CONSTRAINT proveedores_pago_medio_fk FOREIGN KEY (empresa_id, medio_pago_preferido_id) REFERENCES medios_pago (empresa_id, id),
  CONSTRAINT proveedores_pago_condicion_fk FOREIGN KEY (condicion_pago_id) REFERENCES condiciones_pago (id),
  CONSTRAINT proveedores_creado_por_fk  FOREIGN KEY (empresa_id, creado_por)        REFERENCES usuarios (empresa_id, id),
  
  CONSTRAINT proveedores_pry_ruc_chk  CHECK (pais_codigo <> 'PRY' OR tipo_documento = 'RUC'),   
  CONSTRAINT proveedores_ruc_chk      CHECK (tipo_documento <> 'RUC' OR (numero_documento ~ '^[0-9]{3,8}$' AND dv IS NOT NULL)),  
  CONSTRAINT proveedores_dv_only_ruc_chk CHECK (tipo_documento = 'RUC' OR dv IS NULL),  
  CONSTRAINT proveedores_relationship_dates_chk CHECK (fecha_fin_relacion IS NULL OR fecha_inicio_relacion IS NULL OR fecha_fin_relacion >= fecha_inicio_relacion),
  CONSTRAINT proveedores_homologation_dates_chk CHECK (fecha_vencimiento_homologacion IS NULL OR fecha_homologacion IS NULL OR fecha_vencimiento_homologacion >= fecha_homologacion)
);

CREATE INDEX proveedores_empresa_activo_idx ON proveedores (empresa_id, activo, razon_social);

CREATE TABLE proveedor_contactos (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              uuid        NOT NULL REFERENCES empresas (id),    
  proveedor_id             uuid        NOT NULL,                              
  nombre              text        NOT NULL CHECK (length(btrim(nombre)) > 0 AND char_length(nombre) <= 100),   
  apellido               text        CHECK (char_length(apellido) <= 100),    
  cargo               text        CHECK (char_length(cargo) <= 100),    
  departamento              text        CHECK (char_length(departamento) <= 100),   
  telefono                   text        CHECK (char_length(telefono) <= 50),         
  celular                  text        CHECK (char_length(celular) <= 50),        
  email                   text        CHECK (char_length(email) <= 150 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),  
  es_principal              boolean     NOT NULL DEFAULT false,   
  recibe_cotizaciones     boolean     NOT NULL DEFAULT false,   
  recibe_ordenes_compra boolean    NOT NULL DEFAULT false,   
  recibe_logistica      boolean     NOT NULL DEFAULT false,   
  recibe_devoluciones        boolean     NOT NULL DEFAULT false,   
  recibe_pagos       boolean     NOT NULL DEFAULT false,   
  recibe_calidad        boolean     NOT NULL DEFAULT false,   
  recibe_notificaciones  boolean     NOT NULL DEFAULT true,    
  creado_at              timestamptz NOT NULL DEFAULT now(),
  actualizado_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proveedor_contactos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT proveedor_contactos_proveedor_fk FOREIGN KEY (empresa_id, proveedor_id) REFERENCES proveedores (empresa_id, id) ON DELETE CASCADE
);

CREATE INDEX proveedor_contactos_proveedor_idx ON proveedor_contactos (empresa_id, proveedor_id);

CREATE UNIQUE INDEX proveedor_contactos_uno_principal_uq ON proveedor_contactos (empresa_id, proveedor_id) WHERE es_principal;

CREATE TABLE proveedor_direcciones (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid        NOT NULL REFERENCES empresas (id),   
  proveedor_id      uuid        NOT NULL,                             
  tipo     text        NOT NULL CONSTRAINT proveedor_direcciones_tipo_chk CHECK (tipo IN ('FISCAL','COMERCIAL','RETIRO','PAGOS','OTRA')),  
  descripcion      text        NOT NULL CHECK (length(btrim(descripcion)) > 0 AND char_length(descripcion) <= 150),   
  direccion   text        NOT NULL CHECK (length(btrim(direccion)) > 0 AND char_length(direccion) <= 300),  
  numero_casa     text        CHECK (char_length(numero_casa) <= 20),   
  pais_codigo     text        NOT NULL CONSTRAINT proveedor_direcciones_pais_chk CHECK (pais_codigo ~ '^[A-Z]{3}$'),   
  departamento_codigo  integer     CONSTRAINT proveedor_direcciones_dep_chk CHECK (departamento_codigo > 0),   
  distrito_codigo    integer     CONSTRAINT proveedor_direcciones_dis_chk CHECK (distrito_codigo > 0),     
  ciudad_codigo        integer     CONSTRAINT proveedor_direcciones_city_chk CHECK (ciudad_codigo > 0),        
  departamento  text        CHECK (char_length(departamento) <= 150),   
  distrito    text        CHECK (char_length(distrito) <= 150),     
  ciudad        text        CHECK (char_length(ciudad) <= 150),         
  codigo_postal      text        CHECK (char_length(codigo_postal) <= 30),        
  es_principal       boolean     NOT NULL DEFAULT false,   
  creado_at       timestamptz NOT NULL DEFAULT now(),
  actualizado_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proveedor_direcciones_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT proveedor_direcciones_proveedor_fk FOREIGN KEY (empresa_id, proveedor_id) REFERENCES proveedores (empresa_id, id) ON DELETE CASCADE,
  
  
  CONSTRAINT proveedor_direcciones_geo_codigos_chk CHECK (
    (pais_codigo = 'PRY' AND departamento_codigo IS NOT NULL AND distrito_codigo IS NOT NULL AND ciudad_codigo IS NOT NULL)
    OR (pais_codigo <> 'PRY' AND departamento_codigo IS NULL AND distrito_codigo IS NULL AND ciudad_codigo IS NULL))
);

CREATE INDEX proveedor_direcciones_proveedor_idx ON proveedor_direcciones (empresa_id, proveedor_id);

CREATE UNIQUE INDEX proveedor_direcciones_uno_principal_per_tipo_uq ON proveedor_direcciones (empresa_id, proveedor_id, tipo) WHERE es_principal;

CREATE TABLE proveedor_cuentas_bancarias (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid        NOT NULL REFERENCES empresas (id),   
  proveedor_id     uuid        NOT NULL,                             
  banco       text        NOT NULL CHECK (length(btrim(banco)) > 0 AND char_length(banco) <= 150),        
  sucursal_banco     text        CHECK (char_length(sucursal_banco) <= 150),                                                  
  titular  text        NOT NULL CHECK (length(btrim(titular)) > 0 AND char_length(titular) <= 200), 
  documento_titular   text        CHECK (char_length(documento_titular) <= 100),                                                
  tipo_cuenta    text        NOT NULL DEFAULT 'CORRIENTE'
                              CONSTRAINT proveedor_cuentas_bancarias_tipo_chk CHECK (tipo_cuenta IN ('CORRIENTE','AHORRO','CAJA_AHORRO','OTRA')),  
  numero_cuenta  text        NOT NULL CHECK (length(btrim(numero_cuenta)) > 0 AND char_length(numero_cuenta) <= 100),  
  moneda_codigo   text        NOT NULL REFERENCES monedas (codigo),                                                     
  alias_cuenta           text        CHECK (char_length(alias_cuenta) <= 100),                                                        
  codigo_swift      text        CHECK (char_length(codigo_swift) <= 30),                                                    
  iban            text        CHECK (char_length(iban) <= 50),                                                          
  es_principal      boolean     NOT NULL DEFAULT false,                                                                   
  creado_at      timestamptz NOT NULL DEFAULT now(),
  actualizado_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proveedor_cuentas_bancarias_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT proveedor_cuentas_bancarias_proveedor_fk FOREIGN KEY (empresa_id, proveedor_id) REFERENCES proveedores (empresa_id, id) ON DELETE CASCADE,
  
  CONSTRAINT proveedor_cuentas_bancarias_numero_key UNIQUE (empresa_id, proveedor_id, numero_cuenta)
);

CREATE INDEX proveedor_cuentas_bancarias_proveedor_idx ON proveedor_cuentas_bancarias (empresa_id, proveedor_id);

CREATE UNIQUE INDEX proveedor_cuentas_bancarias_uno_principal_uq ON proveedor_cuentas_bancarias (empresa_id, proveedor_id) WHERE es_principal;

CREATE TABLE proveedor_retenciones (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid        NOT NULL REFERENCES empresas (id),   
  proveedor_id           uuid        NOT NULL,                             
  tipo      text        NOT NULL CONSTRAINT proveedor_retenciones_tipo_chk CHECK (tipo IN ('IVA','RENTA','OTRA')),  
  porcentaje              numeric(5,2) NOT NULL CONSTRAINT proveedor_retenciones_rate_chk CHECK (porcentaje BETWEEN 0 AND 100),  
  certificado_obligatorio  boolean     NOT NULL DEFAULT false,   
  fecha_vigencia_desde            date,       
  fecha_vigencia_hasta              date,       
  observacion                 text        CHECK (char_length(observacion) <= 1000),   
  impuesto_id                uuid        REFERENCES impuestos (id),   
  creado_at            timestamptz NOT NULL DEFAULT now(),
  actualizado_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proveedor_retenciones_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT proveedor_retenciones_proveedor_fk FOREIGN KEY (empresa_id, proveedor_id) REFERENCES proveedores (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT proveedor_retenciones_valid_chk CHECK (fecha_vigencia_hasta IS NULL OR fecha_vigencia_desde IS NULL OR fecha_vigencia_hasta >= fecha_vigencia_desde)
);

CREATE INDEX proveedor_retenciones_proveedor_idx ON proveedor_retenciones (empresa_id, proveedor_id);

CREATE TABLE proveedor_documentos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid        NOT NULL REFERENCES empresas (id),   
  proveedor_id    uuid        NOT NULL,                             
  tipo  text        NOT NULL DEFAULT 'OTRO'
                 CONSTRAINT proveedor_documentos_tipo_chk CHECK (tipo IN ('CONTRATO','CONSTANCIA_RUC','CERTIFICADO_BANCARIO','CERTIFICADO_RETENCION','LICENCIA','OTRO')),  
                 
  nombre_archivo      text        NOT NULL CHECK (length(btrim(nombre_archivo)) > 0 AND char_length(nombre_archivo) <= 255),   
  url_archivo       text        NOT NULL CHECK (length(btrim(url_archivo)) > 0),   
  fecha_emision     date,       
  fecha_vencimiento    date,       
  observacion          text        CHECK (char_length(observacion) <= 1000),   
  cargado_por     uuid,       
  creado_at     timestamptz NOT NULL DEFAULT now(),
  actualizado_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proveedor_documentos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT proveedor_documentos_proveedor_fk FOREIGN KEY (empresa_id, proveedor_id) REFERENCES proveedores (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT proveedor_documentos_creado_por_fk FOREIGN KEY (empresa_id, cargado_por) REFERENCES usuarios (empresa_id, id),
  CONSTRAINT proveedor_documentos_dates_chk CHECK (fecha_vencimiento IS NULL OR fecha_emision IS NULL OR fecha_vencimiento >= fecha_emision)
);

CREATE INDEX proveedor_documentos_proveedor_idx ON proveedor_documentos (empresa_id, proveedor_id);

-- El código desplegado inserta proveedores sin codigo: se asigna PRV-nnnnnn por empresa (igual que CLI-nnnnnn en clientes).
CREATE OR REPLACE FUNCTION proveedores_asignar_codigo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('proveedores.codigo:' || coalesce(NEW.empresa_id::text, ''), 0));
    SELECT 'PRV-' || lpad((coalesce(max(substring(p.codigo FROM '^PRV-([0-9]+)$')::bigint), 0) + 1)::text, 6, '0')
      INTO NEW.codigo FROM proveedores p WHERE p.empresa_id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER proveedores_asignar_codigo_trg BEFORE INSERT ON proveedores FOR EACH ROW EXECUTE FUNCTION proveedores_asignar_codigo();
ALTER TABLE proveedores ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE proveedores ADD COLUMN pais_nombre text;
CREATE TRIGGER proveedores_pais_nombre_trg BEFORE INSERT OR UPDATE OF pais_codigo ON proveedores FOR EACH ROW EXECUTE FUNCTION nex_completar_pais_nombre();
SELECT nex_instalar_heredar_empresa('proveedor_contactos','proveedores','proveedor_id');
SELECT nex_instalar_heredar_empresa('proveedor_direcciones','proveedores','proveedor_id');
SELECT nex_instalar_heredar_empresa('proveedor_cuentas_bancarias','proveedores','proveedor_id');
SELECT nex_instalar_heredar_empresa('proveedor_retenciones','proveedores','proveedor_id');
SELECT nex_instalar_heredar_empresa('proveedor_documentos','proveedores','proveedor_id');

SELECT nex_instalar_triggers_actualizacion();
