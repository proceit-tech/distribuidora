-- =====================================================================
-- NEX-045 — Catálogos comerciales: Tipos de cambio (manual, versionado), Canales de venta y Zonas comerciales.
-- Requiere NEX-004 (zonas_comerciales, canales_venta), NEX-003 (monedas), NEX-002 (usuarios) y la convención de grants de NEX-037/039/041.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-045.sql.
--
-- TIPOS DE CAMBIO (decisión DECISION-LISTAS-PRECIO-CAMBIO-MANUAL): carga 100 % manual, sin integraciones. Una fila = la cotización de una
--   moneda (≠ PYG) en una fecha, expresada en PYG por 1 unidad de esa moneda. NO existía ninguna estructura cambiaria previa (se buscó en
--   migraciones v1 y fuentes históricas). Las filas son INMUTABLES: corregir = nueva versión (version+1) y la anterior pasa a vigente=false;
--   anular = vigente=false. Nada se borra ni se sobrescribe; cada fila guarda quién la cargó y quién la retiró.
-- CANALES Y ZONAS: se reutilizan las tablas existentes (sin columnas nuevas). Se agrega unicidad por nombre dentro de la empresa y de código sin
--   distinguir mayúsculas; si ya hubiera duplicados la migración ABORTA sin cambiar nada. Se habilita INSERT/UPDATE (jamás DELETE) al rol de la aplicación.
-- No se convierte ningún precio o costo por cambio: esa regla de negocio no está aprobada.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.zonas_comerciales') IS NULL OR to_regclass('public.canales_venta') IS NULL OR to_regclass('public.monedas') IS NULL THEN
    RAISE EXCEPTION 'NEX-045 requiere NEX-003 y NEX-004 (monedas, zonas_comerciales, canales_venta).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_proveedores()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_fiscal()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_productos()') IS NULL THEN
    RAISE EXCEPTION 'NEX-045 requiere NEX-037, NEX-039 y NEX-041 (envoltorio de grants del runtime).';
  END IF;
  IF to_regclass('public.tipos_cambio') IS NOT NULL THEN
    RAISE EXCEPTION 'tipos_cambio ya existe: NEX-045 parece aplicada; no se reaplica por suposición.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.zonas_comerciales GROUP BY empresa_id, lower(btrim(nombre)) HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM public.zonas_comerciales GROUP BY empresa_id, lower(btrim(codigo)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'zonas_comerciales tiene nombres o códigos duplicados dentro de una empresa: depúrelos manualmente antes de aplicar NEX-045 (no se modifican datos).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.canales_venta GROUP BY empresa_id, lower(btrim(nombre)) HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM public.canales_venta GROUP BY empresa_id, lower(btrim(codigo)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'canales_venta tiene nombres o códigos duplicados dentro de una empresa: depúrelos manualmente antes de aplicar NEX-045 (no se modifican datos).';
  END IF;
END $$;

-- 1) Unicidad de canales y zonas (sin distinguir mayúsculas ni espacios extremos)
CREATE UNIQUE INDEX zonas_comerciales_empresa_nombre_key ON public.zonas_comerciales (empresa_id, lower(btrim(nombre)));
CREATE UNIQUE INDEX zonas_comerciales_empresa_codigo_ci_key ON public.zonas_comerciales (empresa_id, lower(btrim(codigo)));
CREATE UNIQUE INDEX canales_venta_empresa_nombre_key ON public.canales_venta (empresa_id, lower(btrim(nombre)));
CREATE UNIQUE INDEX canales_venta_empresa_codigo_ci_key ON public.canales_venta (empresa_id, lower(btrim(codigo)));

-- 2) Tipos de cambio (cotización manual en PYG por 1 unidad de la moneda)
CREATE TABLE public.tipos_cambio (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid          NOT NULL REFERENCES public.empresas (id),
  fecha          date          NOT NULL,
  moneda_codigo  text          NOT NULL REFERENCES public.monedas (codigo),
  cambio         numeric(18,6) NOT NULL CONSTRAINT tipos_cambio_cambio_chk CHECK (cambio > 0),
  version        integer       NOT NULL DEFAULT 1 CONSTRAINT tipos_cambio_version_chk CHECK (version >= 1),
  motivo         text          CONSTRAINT tipos_cambio_motivo_chk CHECK (motivo IS NULL OR (length(btrim(motivo)) > 0 AND char_length(motivo) <= 200)),
  vigente        boolean       NOT NULL DEFAULT true,
  creado_por     uuid,
  creado_at      timestamptz   NOT NULL DEFAULT now(),
  retirado_por   uuid,
  retirado_at    timestamptz,
  CONSTRAINT tipos_cambio_moneda_chk CHECK (moneda_codigo <> 'PYG'),
  CONSTRAINT tipos_cambio_retiro_chk CHECK ((vigente AND retirado_at IS NULL AND retirado_por IS NULL) OR (NOT vigente AND retirado_at IS NOT NULL)),
  CONSTRAINT tipos_cambio_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT tipos_cambio_version_key UNIQUE (empresa_id, fecha, moneda_codigo, version),
  CONSTRAINT tipos_cambio_creado_por_fk FOREIGN KEY (empresa_id, creado_por) REFERENCES public.usuarios (empresa_id, id),
  CONSTRAINT tipos_cambio_retirado_por_fk FOREIGN KEY (empresa_id, retirado_por) REFERENCES public.usuarios (empresa_id, id)
);

-- Una sola cotización vigente por empresa, fecha y moneda; el historial (versiones retiradas) se conserva.
CREATE UNIQUE INDEX tipos_cambio_vigente_uq ON public.tipos_cambio (empresa_id, fecha, moneda_codigo) WHERE vigente;
CREATE INDEX tipos_cambio_consulta_idx ON public.tipos_cambio (empresa_id, moneda_codigo, fecha DESC);

COMMENT ON TABLE public.tipos_cambio IS 'Cotización manual por empresa: PYG por 1 unidad de la moneda en una fecha. Solo altas; corregir = nueva versión; retirar = vigente=false.';

-- Inmutable salvo el retiro (vigente true → false con quién y cuándo); nunca DELETE ni TRUNCATE.
CREATE OR REPLACE FUNCTION public.tipos_cambio_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'tipos_cambio conserva su historial: no se vacía.' USING ERRCODE = 'P0001';
  ELSIF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'tipos_cambio conserva su historial: no se elimina.' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.vigente IS NOT TRUE OR NEW.vigente IS TRUE
     OR (NEW.empresa_id, NEW.fecha, NEW.moneda_codigo, NEW.cambio, NEW.version, NEW.motivo, NEW.creado_por, NEW.creado_at)
        IS DISTINCT FROM (OLD.empresa_id, OLD.fecha, OLD.moneda_codigo, OLD.cambio, OLD.version, OLD.motivo, OLD.creado_por, OLD.creado_at) THEN
    RAISE EXCEPTION 'tipos_cambio solo admite retirar una cotización vigente; para corregirla registre una nueva versión.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tipos_cambio_inmutable_fila_trg
  BEFORE UPDATE OR DELETE ON public.tipos_cambio
  FOR EACH ROW EXECUTE FUNCTION public.tipos_cambio_inmutable();

CREATE TRIGGER tipos_cambio_inmutable_truncate_trg
  BEFORE TRUNCATE ON public.tipos_cambio
  FOR EACH STATEMENT EXECUTE FUNCTION public.tipos_cambio_inmutable();

-- 3) Privilegios del rol de la aplicación (idempotentes y resistentes a nex_aplicar_grants_runtime(), que hace REVOKE ALL + reconcesión)
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_comercial() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  -- Canales y zonas: alta y edición (exclusión lógica por activo); jamás DELETE.
  REVOKE ALL ON public.canales_venta, public.zonas_comerciales FROM nexit_runtime;
  GRANT SELECT, INSERT, UPDATE ON public.canales_venta, public.zonas_comerciales TO nexit_runtime;

  -- Tipos de cambio: lectura, altas y solo el retiro (columnas vigente/retirado_*).
  REVOKE ALL ON public.tipos_cambio FROM nexit_runtime;
  GRANT SELECT, INSERT ON public.tipos_cambio TO nexit_runtime;
  GRANT UPDATE (vigente, retirado_por, retirado_at) ON public.tipos_cambio TO nexit_runtime;
END $$;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
  PERFORM public.nex_aplicar_grants_fiscal();
  PERFORM public.nex_aplicar_grants_productos();
  PERFORM public.nex_aplicar_grants_comercial();
END $$;

SELECT public.nex_aplicar_grants_comercial();
