-- REVERSIÓN manual de NEX-037 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-037.sql
-- ABORTA si hay cuentas desactivadas (su estado no podría representarse y reaparecerían como activas). Después hay que borrar la
-- fila 'NEX-037' de schema_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.proveedor_cuentas_bancarias WHERE NOT activa) THEN
    RAISE EXCEPTION 'Hay cuentas bancarias desactivadas: no se revierte NEX-037 para no reactivarlas ni perder su trazabilidad.';
  END IF;
END $$;

-- Restaura la función de grants original (el envoltorio se elimina y la _base recupera su nombre).
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_runtime();
DO $$
BEGIN
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NOT NULL THEN
    ALTER FUNCTION public.nex_aplicar_grants_runtime_base() RENAME TO nex_aplicar_grants_runtime;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_proveedores();

DROP TRIGGER IF EXISTS proveedor_eventos_inmutable_truncate_trg ON public.proveedor_eventos;
DROP TRIGGER IF EXISTS proveedor_eventos_inmutable_fila_trg ON public.proveedor_eventos;
DROP FUNCTION IF EXISTS public.proveedor_eventos_inmutable();

DROP TRIGGER IF EXISTS proveedor_cuentas_no_eliminar_aprobadas_trg ON public.proveedor_cuentas_bancarias;
DROP FUNCTION IF EXISTS public.proveedor_cuentas_no_eliminar_aprobadas();

CREATE OR REPLACE FUNCTION public.proveedor_cuenta_pagable(p_empresa uuid, p_cuenta uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.proveedor_cuentas_bancarias c
                  WHERE c.empresa_id = p_empresa AND c.id = p_cuenta AND c.estado_aprobacion = 'APROBADA')
$$;

DROP INDEX IF EXISTS public.proveedor_cuentas_bancarias_principal_moneda_uq;
CREATE UNIQUE INDEX proveedor_cuentas_bancarias_principal_moneda_uq
  ON public.proveedor_cuentas_bancarias (empresa_id, proveedor_id, moneda_codigo)
  WHERE es_principal AND estado_aprobacion = 'APROBADA';

ALTER TABLE public.proveedor_cuentas_bancarias
  DROP CONSTRAINT IF EXISTS proveedor_cuentas_bancarias_desactivada_chk,
  DROP CONSTRAINT IF EXISTS proveedor_cuentas_bancarias_desactivador_fk,
  DROP COLUMN IF EXISTS motivo_desactivacion,
  DROP COLUMN IF EXISTS desactivada_por,
  DROP COLUMN IF EXISTS desactivada_at,
  DROP COLUMN IF EXISTS activa;
