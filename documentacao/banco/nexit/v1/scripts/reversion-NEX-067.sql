-- =====================================================================
-- REVERSIÓN de NEX-067 (control y baja de stock al emitir la FE). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-067.sql
-- SEGURIDAD: se NIEGA a revertir si ya existe alguna baja de stock vinculada a una FE (documento_electronico_stock_salidas con filas): esas salidas de inventario son legítimas y la tabla es la evidencia que las
-- une a su FE; borrarla dejaría movimientos huérfanos y permitiría repetir la baja. En ese caso NO revierta: resuelva con el responsable (la reversión fiscal por cancelación pertenece a E10).
-- Antes de revertir, DESPLIEGUE la versión de la aplicación anterior a E02 (la nueva exige estas funciones). NO toca movimientos_inventario ni el motor (NEX-014).
-- Después hay que borrar la fila 'NEX-067' de schema_migrations.
-- =====================================================================
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '60s', true);
  IF to_regclass('public.documento_electronico_stock_salidas') IS NULL THEN
    RAISE EXCEPTION 'NEX-067 no está aplicada (documento_electronico_stock_salidas no existe): nada que revertir.';
  END IF;
  LOCK TABLE public.documento_electronico_stock_salidas IN EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_stock_salidas) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: ya hay facturas con baja de stock registrada. No se destruye la evidencia que une cada FE con sus salidas de inventario.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS fe_stock_movimiento_protegido_trg ON public.movimientos_inventario;
DROP FUNCTION IF EXISTS public.fe_stock_movimiento_protegido();
DROP FUNCTION IF EXISTS public.fe_documento_crear_fe_con_stock(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fe_stock_baja_documento(uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.fe_stock_disponibilidad(uuid, uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion_stock();
DROP TABLE public.documento_electronico_stock_salidas;
DROP FUNCTION IF EXISTS public.fe_stock_salidas_inmutable();

-- La aplicación anterior crea la FE con la función original: se le devuelve el permiso que NEX-067 retiró.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.fe_documento_crear_fe(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb) TO nexit_runtime;
  END IF;
END $$;
