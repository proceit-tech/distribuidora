-- =====================================================================
-- REVERSIÓN de NEX-066 (intenciones de movimientos). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-066.sql
-- SEGURIDAD: se NIEGA a revertir si existe alguna intención RESERVADA (incierta) o CONFIRMADA todavía NO RECONOCIDA por el operador: borrarlas destruiría la protección contra la duplicación de un movimiento posiblemente
-- ya registrado (o cuyo resultado el operador aún no recibió). Resuelva antes cada pendiente (confirmar con el movimiento original / reconocimiento / rechazo comprobado) y revise las filas con la consulta de abajo. NO toca movimientos_inventario ni el motor (NEX-014).
-- Antes de revertir la base, DESPLIEGUE la versión de la aplicación anterior a PRO-188 (la nueva exige estas funciones). Después hay que borrar la fila 'NEX-066' de schema_migrations.
--   Consulta previa: SELECT empresa_id, usuario_id, clave, estado, numero_movimiento, creado_at FROM public.movimientos_intenciones WHERE reconocida_at IS NULL AND estado IN ('RESERVADA', 'CONFIRMADA');
-- =====================================================================
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '60s', true);
  IF to_regclass('public.movimientos_intenciones') IS NULL THEN
    RAISE EXCEPTION 'NEX-066 no está aplicada (movimientos_intenciones no existe): nada que revertir.';
  END IF;
  LOCK TABLE public.movimientos_intenciones IN EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.movimientos_intenciones WHERE reconocida_at IS NULL AND estado IN ('RESERVADA', 'CONFIRMADA')) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: hay intenciones RESERVADAS (inciertas) o CONFIRMADAS sin reconocer. Resuélvalas antes; no se destruye la protección contra duplicación ni la evidencia de recuperación.';
  END IF;
  IF to_regclass('public.movimientos_intenciones_respaldo_nex066') IS NOT NULL THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: ya existe movimientos_intenciones_respaldo_nex066; revise y conserve ese respaldo antes de continuar (no se sobrescribe evidencia).';
  END IF;
END $$;

-- Conserva la auditoría de las intenciones resueltas en una tabla de respaldo (sin acceso para la aplicación).
CREATE TABLE public.movimientos_intenciones_respaldo_nex066 AS SELECT * FROM public.movimientos_intenciones;
REVOKE ALL ON public.movimientos_intenciones_respaldo_nex066 FROM PUBLIC;

DROP FUNCTION IF EXISTS public.movimiento_intencion_reservar(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.movimiento_intencion_pendiente(uuid, uuid);
DROP FUNCTION IF EXISTS public.movimiento_intencion_tomar(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.movimiento_intencion_confirmar(uuid, uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.movimiento_intencion_rechazar(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.movimiento_intencion_reconocer(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_movimientos_intenciones();
DROP TABLE public.movimientos_intenciones;
