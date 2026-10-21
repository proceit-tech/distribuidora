-- =====================================================================
-- REVERSIÓN de NEX-068 (dirección de entrega en la FE). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-068.sql
-- SEGURIDAD: se NIEGA a revertir si ya existe algún destino guardado en una FE (documento_electronico_entregas con filas): es la fotografía trazable de cada entrega y no se destruye.
-- Antes de revertir, DESPLIEGUE la versión de la aplicación anterior a E04 (la nueva exige estas funciones). NO toca NEX-067 ni el payload. Después hay que borrar la fila 'NEX-068' de schema_migrations.
-- =====================================================================
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '60s', true);
  IF to_regclass('public.documento_electronico_entregas') IS NULL THEN
    RAISE EXCEPTION 'NEX-068 no está aplicada (documento_electronico_entregas no existe): nada que revertir.';
  END IF;
  LOCK TABLE public.documento_electronico_entregas IN EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_entregas) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: ya hay facturas con destino de entrega guardado. No se destruye la fotografía trazable de cada entrega.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.fe_documento_crear_fe_con_stock_entrega(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid);
DROP FUNCTION IF EXISTS public.fe_entrega_opciones(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.fe_entrega_elegible(text, boolean, boolean);
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion_stock_entrega();
DROP TABLE public.documento_electronico_entregas;
DROP FUNCTION IF EXISTS public.fe_entregas_inmutable();

-- La aplicación anterior emite por la función de NEX-067: se le devuelve el permiso que NEX-068 retiró.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') AND to_regprocedure('public.fe_documento_crear_fe_con_stock(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.fe_documento_crear_fe_con_stock(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb) TO nexit_runtime;
  END IF;
END $$;
