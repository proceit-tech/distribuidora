-- =====================================================================
-- NEX-003 — Catálogos globales
-- Geografía, monedas, incoterms, unidades de medida, impuestos y condiciones de pago (globales, como las lee el código desplegado).
-- Proyecto Nexit (REQ NEXIT-2026-001). ESTADO: PROPUESTA para revisión técnica.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- =====================================================================

CREATE TABLE referencia_geografica_paises (
  codigo        text        PRIMARY KEY CHECK (codigo ~ '^[A-Z]{3}$'),   
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),  
  activo   boolean     NOT NULL DEFAULT true,                     
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE referencia_geografica_departamentos (
  codigo        integer     PRIMARY KEY CHECK (codigo > 0),              
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),
  activo   boolean     NOT NULL DEFAULT true,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE referencia_geografica_distritos (
  departamento_codigo integer     NOT NULL REFERENCES referencia_geografica_departamentos (codigo),   
  codigo            integer     NOT NULL CHECK (codigo > 0),                    
  nombre            text        NOT NULL CHECK (length(btrim(nombre)) > 0),
  activo       boolean     NOT NULL DEFAULT true,
  creado_at      timestamptz NOT NULL DEFAULT now(),
  actualizado_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (departamento_codigo, codigo)
);

CREATE TABLE referencia_geografica_ciudades (
  departamento_codigo integer     NOT NULL,
  distrito_codigo   integer     NOT NULL,
  codigo            integer     NOT NULL CHECK (codigo > 0),                    
  nombre            text        NOT NULL CHECK (length(btrim(nombre)) > 0),
  activo       boolean     NOT NULL DEFAULT true,
  creado_at      timestamptz NOT NULL DEFAULT now(),
  actualizado_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (departamento_codigo, distrito_codigo, codigo),
  CONSTRAINT referencia_geografica_ciudades_district_fk FOREIGN KEY (departamento_codigo, distrito_codigo)
    REFERENCES referencia_geografica_distritos (departamento_codigo, codigo)                          
);

CREATE TABLE monedas (
  codigo        text        PRIMARY KEY CHECK (codigo ~ '^[A-Z]{3}$'),       
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),
  simbolo      text,                                                       
  activo   boolean     NOT NULL DEFAULT true,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incoterms (
  codigo        text        PRIMARY KEY CHECK (codigo ~ '^[A-Z]{3}$'),       
  nombre        text,                                                       
  activo   boolean     NOT NULL DEFAULT true,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE unidades_medida (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo               text        NOT NULL CHECK (length(btrim(codigo)) > 0),   
  nombre               text        NOT NULL CHECK (length(btrim(nombre)) > 0),   
  codigo_sifen         text,                                                    
  descripcion_sifen  text,                                                    
  activo          boolean     NOT NULL DEFAULT true,
  creado_at         timestamptz NOT NULL DEFAULT now(),
  actualizado_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unidades_medida_codigo_key UNIQUE (codigo)                          
);

CREATE TABLE impuestos (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text          NOT NULL CHECK (length(btrim(codigo)) > 0),      
  nombre          text          NOT NULL CHECK (length(btrim(nombre)) > 0),      
  
  porcentaje  numeric(5,2)  NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
  activo     boolean       NOT NULL DEFAULT true,
  creado_at    timestamptz   NOT NULL DEFAULT now(),
  actualizado_at    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT impuestos_codigo_key UNIQUE (codigo)                                    
);

CREATE TABLE condiciones_pago (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           text        NOT NULL CHECK (length(btrim(codigo)) > 0),       
  nombre           text        NOT NULL CHECK (length(btrim(nombre)) > 0),       
  dias_vencimiento       integer,                                                    
  requiere_credito boolean    NOT NULL DEFAULT false,                         
  activo      boolean     NOT NULL DEFAULT true,                          
  creado_at     timestamptz NOT NULL DEFAULT now(),
  actualizado_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT condiciones_pago_codigo_key UNIQUE (codigo)
);

SELECT nex_instalar_triggers_actualizacion();
