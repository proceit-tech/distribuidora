-- =====================================================================
-- NEX-002 — Seguridad y estructura de empresa
-- Empresas, sucursales, depósitos, usuarios, perfiles, permisos, sesiones y eventos de seguridad.
-- Proyecto Nexit (REQ NEXIT-2026-001). ESTADO: PROPUESTA para revisión técnica.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- =====================================================================

CREATE TABLE empresas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo               text        NOT NULL CHECK (codigo = lower(codigo) AND codigo ~ '^[a-z0-9_.-]{1,40}$'),
  razon_social         text        NOT NULL CHECK (length(btrim(razon_social)) > 0),
  ruc             text,                         
  dv text,                         
  estado             text        NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA','SUSPENDIDA')),
  version_acceso     integer     NOT NULL DEFAULT 1,
  creado_at         timestamptz NOT NULL DEFAULT now(),
  actualizado_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresas_codigo_key UNIQUE (codigo)      
);

CREATE TABLE sucursales (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             uuid        NOT NULL REFERENCES empresas (id),
  codigo                   text        NOT NULL,
  nombre                   text        NOT NULL,
  establecimiento_sifen    text,                     
  activo              boolean     NOT NULL DEFAULT true,
  creado_at             timestamptz NOT NULL DEFAULT now(),
  actualizado_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sucursales_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT sucursales_empresa_codigo_key  UNIQUE (empresa_id, codigo),
  CONSTRAINT sucursales_sifen_est_chk CHECK (establecimiento_sifen IS NULL OR establecimiento_sifen ~ '^[0-9]{3}$')
);

CREATE TABLE depositos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid        NOT NULL REFERENCES empresas (id),
  sucursal_id       uuid        NOT NULL,
  codigo            text        NOT NULL,
  nombre            text        NOT NULL,
  es_de_terceros  boolean     NOT NULL DEFAULT false,  
  activo       boolean     NOT NULL DEFAULT true,
  creado_at      timestamptz NOT NULL DEFAULT now(),
  actualizado_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT depositos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT depositos_empresa_codigo_key  UNIQUE (empresa_id, codigo),
  CONSTRAINT depositos_sucursal_fk FOREIGN KEY (empresa_id, sucursal_id) REFERENCES sucursales (empresa_id, id)
);

CREATE TABLE usuarios (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid        NOT NULL REFERENCES empresas (id),
  sucursal_id        uuid,                                 
  usuario              text        NOT NULL CHECK (usuario = lower(usuario) AND length(usuario) BETWEEN 1 AND 80),
  nombre            text        NOT NULL,
  apellido             text,
  email                 text,
  password_hash         text        NOT NULL,                 
  estado                text        NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','BLOQUEADO','BAJA')),  
  alcance_sucursales          text        NOT NULL DEFAULT 'ASIGNADAS' CHECK (alcance_sucursales IN ('TODAS','ASIGNADAS')),    
  alcance_depositos       text        NOT NULL DEFAULT 'ASIGNADOS' CHECK (alcance_depositos IN ('TODOS','ASIGNADOS')),
  intentos_fallidos integer     NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta          timestamptz,
  ultimo_acceso_at         timestamptz,
  debe_cambiar_contrasena  boolean     NOT NULL DEFAULT false,
  baja_at        timestamptz,
  version_acceso        integer     NOT NULL DEFAULT 1,
  creado_por            uuid,
  creado_por_tipo       text        NOT NULL DEFAULT 'PLATAFORMA' CHECK (creado_por_tipo IN ('USUARIO','PLATAFORMA','IMPORTADO')),  
  documento_hash         text,                                 
  email_verificado        boolean     NOT NULL DEFAULT false,
  mfa_activo           boolean     NOT NULL DEFAULT false,
  creado_at            timestamptz NOT NULL DEFAULT now(),
  actualizado_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usuarios_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT usuarios_empresa_username_key UNIQUE (empresa_id, usuario),
  CONSTRAINT usuarios_home_sucursal_fk FOREIGN KEY (empresa_id, sucursal_id) REFERENCES sucursales (empresa_id, id),
  CONSTRAINT usuarios_creado_por_fk  FOREIGN KEY (empresa_id, creado_por)     REFERENCES usuarios (empresa_id, id),
  CONSTRAINT usuarios_creado_por_chk CHECK ((creado_por_tipo = 'USUARIO') = (creado_por IS NOT NULL))
);

CREATE INDEX usuarios_empresa_estado_idx ON usuarios (empresa_id, estado);

CREATE TABLE permisos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         text NOT NULL UNIQUE,                         
  recurso     text NOT NULL,
  accion       text NOT NULL,
  modulo       text,
  nivel_alcance  text NOT NULL DEFAULT 'EMPRESA' CHECK (nivel_alcance IN ('EMPRESA','SUCURSAL','DEPOSITO')),
  clase        text NOT NULL DEFAULT 'OPERACIONAL' CHECK (clase IN ('OPERACIONAL','ADMINISTRATIVA','DATO_SENSIBLE','ACCION_CRITICA')),
  CONSTRAINT permisos_resource_action_key UNIQUE (recurso, accion),
  CONSTRAINT permisos_codigo_chk CHECK (codigo = recurso || '.' || accion)
);

CREATE TABLE perfiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid        NOT NULL REFERENCES empresas (id),
  codigo              text        NOT NULL,
  nombre              text        NOT NULL,
  es_administrador  boolean     NOT NULL DEFAULT false,
  es_sistema         boolean     NOT NULL DEFAULT false,
  activo         boolean     NOT NULL DEFAULT true,
  version           integer     NOT NULL DEFAULT 1,
  creado_at        timestamptz NOT NULL DEFAULT now(),
  actualizado_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT perfiles_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT perfiles_empresa_codigo_key  UNIQUE (empresa_id, codigo)
);

CREATE TABLE perfil_permiso (
  empresa_id     uuid NOT NULL,
  perfil_id        uuid NOT NULL,
  permiso_id  uuid NOT NULL REFERENCES permisos (id),
  PRIMARY KEY (empresa_id, perfil_id, permiso_id),
  CONSTRAINT perfil_permiso_perfil_fk FOREIGN KEY (empresa_id, perfil_id) REFERENCES perfiles (empresa_id, id) ON DELETE CASCADE
);

CREATE INDEX perfil_permiso_permiso_idx ON perfil_permiso (permiso_id);

CREATE OR REPLACE FUNCTION perfil_permiso_bloquear_controlado() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE c text;
BEGIN
  SELECT clase INTO c FROM permisos WHERE id = NEW.permiso_id;
  IF c IN ('DATO_SENSIBLE','ACCION_CRITICA') THEN
    RAISE EXCEPTION 'ESC-13: el permiso controlado (%) no puede estar en un perfil', c USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER perfil_permiso_bloquear_controlado_trg
  BEFORE INSERT OR UPDATE ON perfil_permiso
  FOR EACH ROW EXECUTE FUNCTION perfil_permiso_bloquear_controlado();

CREATE TABLE usuario_perfil (
  empresa_id   uuid        NOT NULL,
  usuario_id      uuid        NOT NULL,
  perfil_id      uuid        NOT NULL,
  asignado_por  uuid,
  asignado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, usuario_id, perfil_id),
  CONSTRAINT usuario_perfil_usuario_fk FOREIGN KEY (empresa_id, usuario_id) REFERENCES usuarios (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT usuario_perfil_perfil_fk FOREIGN KEY (empresa_id, perfil_id) REFERENCES perfiles (empresa_id, id),
  CONSTRAINT usuario_perfil_assigned_por_fk FOREIGN KEY (empresa_id, asignado_por) REFERENCES usuarios (empresa_id, id)
);

CREATE TABLE usuario_sucursal (
  empresa_id   uuid        NOT NULL,
  usuario_id      uuid        NOT NULL,
  sucursal_id    uuid        NOT NULL,
  asignado_por  uuid,
  asignado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, usuario_id, sucursal_id),
  CONSTRAINT usuario_sucursal_usuario_fk   FOREIGN KEY (empresa_id, usuario_id)   REFERENCES usuarios (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT usuario_sucursal_sucursal_fk FOREIGN KEY (empresa_id, sucursal_id) REFERENCES sucursales (empresa_id, id),
  CONSTRAINT usuario_sucursal_por_fk     FOREIGN KEY (empresa_id, asignado_por) REFERENCES usuarios (empresa_id, id)
);

CREATE TABLE usuario_deposito (
  empresa_id    uuid        NOT NULL,
  usuario_id       uuid        NOT NULL,
  deposito_id  uuid        NOT NULL,
  asignado_por   uuid,
  asignado_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, usuario_id, deposito_id),
  CONSTRAINT usuario_deposito_usuario_fk FOREIGN KEY (empresa_id, usuario_id)      REFERENCES usuarios (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT usuario_deposito_dep_fk   FOREIGN KEY (empresa_id, deposito_id) REFERENCES depositos (empresa_id, id),
  CONSTRAINT usuario_deposito_por_fk   FOREIGN KEY (empresa_id, asignado_por)  REFERENCES usuarios (empresa_id, id)
);

CREATE TABLE sesiones_usuario (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid        NOT NULL,
  usuario_id      uuid        NOT NULL,
  token_hash   text        NOT NULL,
  ip           inet,
  user_agent   text,
  creado_at   timestamptz NOT NULL DEFAULT now(),
  expira_at   timestamptz NOT NULL,
  revocada_at   timestamptz,
  CONSTRAINT sesiones_usuario_token_hash_key UNIQUE (token_hash),
  CONSTRAINT sesiones_usuario_usuario_fk FOREIGN KEY (empresa_id, usuario_id) REFERENCES usuarios (empresa_id, id),
  CONSTRAINT sesiones_usuario_exp_chk CHECK (expira_at > creado_at)
);

CREATE INDEX sesiones_usuario_usuario_idx ON sesiones_usuario (empresa_id, usuario_id) WHERE revocada_at IS NULL;

CREATE TABLE eventos_seguridad (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas (id),
  usuario_id     uuid,
  tipo  text        NOT NULL,                   
  detalle     jsonb,
  ip          inet,
  user_agent  text,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventos_seguridad_usuario_fk FOREIGN KEY (empresa_id, usuario_id) REFERENCES usuarios (empresa_id, id)
);

CREATE INDEX eventos_seguridad_empresa_hora_idx ON eventos_seguridad (empresa_id, creado_at DESC);

ALTER TABLE empresas ADD COLUMN activo boolean GENERATED ALWAYS AS (estado = 'ACTIVA') STORED;  -- el login desplegado filtra e.activo
SELECT nex_instalar_heredar_empresa('sesiones_usuario','usuarios','usuario_id');

SELECT nex_instalar_triggers_actualizacion();
