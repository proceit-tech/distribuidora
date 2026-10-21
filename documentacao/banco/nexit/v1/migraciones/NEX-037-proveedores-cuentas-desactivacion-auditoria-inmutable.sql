-- =====================================================================
-- NEX-037 — Proveedores: (PRV-AUD-01) desactivación lógica de cuentas bancarias aprobadas y (PRV-AUD-02) auditoría inmutable de
-- forma estructural y resistente a la reaplicación de grants. Requiere NEX-034, NEX-035 y NEX-036.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-037.sql.
-- No borra ni modifica filas existentes.
--
-- PRV-AUD-01 — cuentas bancarias
--   · Una cuenta que ALGUNA VEZ fue aprobada (estado APROBADA o aprobado_por informado) NO se elimina físicamente: un trigger lo
--     impide para cualquier rol (salvo la cascada del propio proveedor, que no ocurre en la aplicación). Se DESACTIVA (activa = false,
--     con autor, fecha y motivo), conservando su identificador, datos, historial y auditoría.
--   · Una cuenta nunca aprobada (pendiente o rechazada) puede eliminarse; si estuviera referenciada por otra tabla (por ejemplo, una
--     operación futura con FK), la aplicación la desactiva en lugar de eliminarla.
--   · Una cuenta desactivada no es pagable (proveedor_cuenta_pagable) y deja de ocupar la «principal de la moneda».
-- PRV-AUD-02 — proveedor_eventos
--   · Triggers que rechazan UPDATE, DELETE y TRUNCATE para cualquier rol (el DELETE solo se admite en la cascada de la eliminación
--     del proveedor, usada únicamente por el reinicio de empresas DEMO de NEX-012).
--   · nex_aplicar_grants_runtime() (NEX-013…) hace REVOKE ALL y vuelve a conceder solo lo que enumera: deja a las tablas nuevas sin
--     INSERT y devuelve DELETE sobre documentos. Esta migración conserva esa función como ..._base y define un envoltorio que, tras
--     ella, reaplica los privilegios de Proveedores (nex_aplicar_grants_proveedores). Así la reaplicación de grants es idempotente
--     y nunca otorga UPDATE/DELETE sobre eventos.
--   CONVENCIÓN: una migración futura que redefina nex_aplicar_grants_runtime() debe seguir llamando a nex_aplicar_grants_proveedores().
-- =====================================================================

-- 1) Desactivación lógica de cuentas
ALTER TABLE public.proveedor_cuentas_bancarias
  ADD COLUMN activa boolean NOT NULL DEFAULT true,
  ADD COLUMN desactivada_at timestamptz,
  ADD COLUMN desactivada_por uuid,
  ADD COLUMN motivo_desactivacion text CHECK (char_length(motivo_desactivacion) <= 1000),
  ADD CONSTRAINT proveedor_cuentas_bancarias_desactivador_fk FOREIGN KEY (empresa_id, desactivada_por) REFERENCES public.usuarios (empresa_id, id),
  ADD CONSTRAINT proveedor_cuentas_bancarias_desactivada_chk CHECK (
    (activa AND desactivada_at IS NULL AND desactivada_por IS NULL)
    OR (NOT activa AND desactivada_at IS NOT NULL AND desactivada_por IS NOT NULL));

-- La principal de una moneda es una cuenta APROBADA y ACTIVA.
DROP INDEX IF EXISTS public.proveedor_cuentas_bancarias_principal_moneda_uq;
CREATE UNIQUE INDEX proveedor_cuentas_bancarias_principal_moneda_uq
  ON public.proveedor_cuentas_bancarias (empresa_id, proveedor_id, moneda_codigo)
  WHERE es_principal AND estado_aprobacion = 'APROBADA' AND activa;

CREATE OR REPLACE FUNCTION public.proveedor_cuenta_pagable(p_empresa uuid, p_cuenta uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.proveedor_cuentas_bancarias c
                  WHERE c.empresa_id = p_empresa AND c.id = p_cuenta AND c.estado_aprobacion = 'APROBADA' AND c.activa)
$$;

CREATE OR REPLACE FUNCTION public.proveedor_cuentas_no_eliminar_aprobadas() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.estado_aprobacion = 'APROBADA' OR OLD.aprobado_por IS NOT NULL)
     AND EXISTS (SELECT 1 FROM public.proveedores p WHERE p.empresa_id = OLD.empresa_id AND p.id = OLD.proveedor_id) THEN
    RAISE EXCEPTION 'Una cuenta bancaria aprobada no se elimina: se desactiva (se conservan su identificador, historial y auditoría).' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER proveedor_cuentas_no_eliminar_aprobadas_trg
  BEFORE DELETE ON public.proveedor_cuentas_bancarias
  FOR EACH ROW EXECUTE FUNCTION public.proveedor_cuentas_no_eliminar_aprobadas();

-- 2) Auditoría inmutable de forma estructural
CREATE OR REPLACE FUNCTION public.proveedor_eventos_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'proveedor_eventos es de solo altas: no se vacía.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'proveedor_eventos es de solo altas: no se modifica.' USING ERRCODE = 'P0001';
  END IF;
  -- DELETE: solo cuando el proveedor ya no existe (cascada del reinicio DEMO), nunca mientras exista.
  IF EXISTS (SELECT 1 FROM public.proveedores p WHERE p.empresa_id = OLD.empresa_id AND p.id = OLD.proveedor_id) THEN
    RAISE EXCEPTION 'proveedor_eventos es de solo altas: no se elimina.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER proveedor_eventos_inmutable_fila_trg
  BEFORE UPDATE OR DELETE ON public.proveedor_eventos
  FOR EACH ROW EXECUTE FUNCTION public.proveedor_eventos_inmutable();

CREATE TRIGGER proveedor_eventos_inmutable_truncate_trg
  BEFORE TRUNCATE ON public.proveedor_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.proveedor_eventos_inmutable();

-- 3) Privilegios del rol de la aplicación, idempotentes y resistentes a nex_aplicar_grants_runtime()
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_proveedores() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  -- Auditoría y versiones: solo lectura y altas. Jamás UPDATE ni DELETE.
  REVOKE ALL ON public.proveedor_eventos, public.proveedor_documento_versiones FROM nexit_runtime;
  GRANT SELECT, INSERT ON public.proveedor_eventos TO nexit_runtime;
  GRANT SELECT, INSERT ON public.proveedor_documento_versiones TO nexit_runtime;

  -- Revisiones de cuentas: se crean y se resuelven (UPDATE), no se borran.
  REVOKE ALL ON public.proveedor_cuenta_revisiones FROM nexit_runtime;
  GRANT SELECT, INSERT, UPDATE ON public.proveedor_cuenta_revisiones TO nexit_runtime;

  -- Documentos: exclusión lógica, sin DELETE físico.
  REVOKE DELETE ON public.proveedor_documentos FROM nexit_runtime;

  GRANT EXECUTE ON FUNCTION public.proveedor_elegible_para_compra(uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.proveedor_cuenta_pagable(uuid, uuid) TO nexit_runtime;
END $$;

-- La función de grants vigente se conserva como _base (misma definición que tenga la base) y el envoltorio reaplica lo de Proveedores.
DO $$
BEGIN
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL THEN
    ALTER FUNCTION public.nex_aplicar_grants_runtime() RENAME TO nex_aplicar_grants_runtime_base;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
END $$;

SELECT public.nex_aplicar_grants_proveedores();
