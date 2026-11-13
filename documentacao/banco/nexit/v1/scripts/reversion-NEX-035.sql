-- REVERSIÓN manual de NEX-035 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-035.sql
-- ABORTA si hay aprobaciones o revisiones registradas (son la única trazabilidad de la aprobación bancaria) o si, tras volver a
-- una única principal global por proveedor, existirían dos principales. Después hay que borrar la fila 'NEX-035' de schema_migrations.
DO $$
BEGIN
  IF to_regclass('public.proveedor_cuenta_revisiones') IS NOT NULL AND EXISTS (SELECT 1 FROM public.proveedor_cuenta_revisiones) THEN
    RAISE EXCEPTION 'proveedor_cuenta_revisiones contiene revisiones: expórtelas antes de revertir NEX-035.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.proveedor_cuentas_bancarias WHERE estado_aprobacion = 'APROBADA' OR aprobado_por IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay cuentas bancarias aprobadas: no se revierte NEX-035 para no perder la trazabilidad de la aprobación.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.proveedor_cuentas_bancarias WHERE es_principal GROUP BY empresa_id, proveedor_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Hay proveedores con más de una cuenta principal (una por moneda): resuélvalo antes de volver a la regla de una principal global.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.proveedor_cuenta_pagable(uuid, uuid);
DROP TABLE IF EXISTS public.proveedor_cuenta_revisiones;
DROP INDEX IF EXISTS public.proveedor_cuentas_bancarias_principal_moneda_uq;
CREATE UNIQUE INDEX proveedor_cuentas_bancarias_uno_principal_uq ON public.proveedor_cuentas_bancarias (empresa_id, proveedor_id) WHERE es_principal;
ALTER TABLE public.proveedor_cuentas_bancarias
  DROP CONSTRAINT IF EXISTS proveedor_cuentas_bancarias_aprobada_chk,
  DROP CONSTRAINT IF EXISTS proveedor_cuentas_bancarias_aprobador_fk,
  DROP COLUMN IF EXISTS motivo_resolucion,
  DROP COLUMN IF EXISTS aprobado_at,
  DROP COLUMN IF EXISTS aprobado_por,
  DROP COLUMN IF EXISTS estado_aprobacion;
