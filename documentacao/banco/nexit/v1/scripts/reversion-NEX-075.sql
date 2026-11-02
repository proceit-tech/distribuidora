-- =====================================================================
-- REVERSIÓN de NEX-075 (Compras → Entradas). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-075.sql
-- SEGURIDAD: se NIEGA a revertir si existe alguna entrada registrada (compras_entradas con filas: es el vínculo proveedor ↔ movimiento y la fuente de E6-B; borrarla dejaría entradas de stock sin proveedor)
-- o alguna intención RESERVADA / CONFIRMADA sin reconocer (borrarla destruiría la protección contra la duplicación de una entrada posiblemente registrada). NO toca movimientos_inventario ni el motor (NEX-014).
-- Los permisos COMPRAS.VER / COMPRAS.CREAR solo se eliminan del catálogo si ningún perfil los tiene asignados (si están asignados, se conservan y se informa).
-- Antes de revertir la base, DESPLIEGUE la versión de la aplicación anterior a E6-A. Después hay que borrar la fila 'NEX-075' de schema_migrations.
-- =====================================================================
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '60s', true);
  IF to_regclass('public.compras_entradas') IS NULL OR to_regclass('public.compras_entradas_intenciones') IS NULL THEN
    RAISE EXCEPTION 'NEX-075 no está aplicada (faltan compras_entradas / compras_entradas_intenciones): nada que revertir.';
  END IF;
  LOCK TABLE public.compras_entradas IN EXCLUSIVE MODE;
  LOCK TABLE public.compras_entradas_intenciones IN EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.compras_entradas) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: ya hay entradas de Compras registradas. No se destruye el vínculo proveedor ↔ movimiento.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.compras_entradas_intenciones WHERE reconocida_at IS NULL AND estado IN ('RESERVADA', 'CONFIRMADA')) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: hay intenciones de entrada RESERVADAS (inciertas) o CONFIRMADAS sin reconocer. Resuélvalas antes.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.compras_entrada_intencion_reconocer(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.compras_entrada_ejecutar(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.compras_entrada_registrar(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.compras_entrada_intencion_pendiente(uuid, uuid);
DROP FUNCTION IF EXISTS public.compras_entrada_intencion_reservar(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.compras_entrada_intencion_visible(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_compras_entradas();
DROP TABLE public.compras_entradas_intenciones;
DROP TABLE public.compras_entradas;
DROP FUNCTION IF EXISTS public.compras_entradas_inmutable();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.perfil_permiso pp JOIN public.permisos pe ON pe.id = pp.permiso_id WHERE pe.codigo IN ('COMPRAS.VER', 'COMPRAS.CREAR')) THEN
    RAISE NOTICE 'Los permisos COMPRAS.VER / COMPRAS.CREAR están asignados a perfiles: se conservan en el catálogo.';
  ELSE
    DELETE FROM public.permisos WHERE codigo IN ('COMPRAS.VER', 'COMPRAS.CREAR');
  END IF;
END $$;
