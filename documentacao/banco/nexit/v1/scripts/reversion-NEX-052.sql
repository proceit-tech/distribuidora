-- REVERSIÓN manual de NEX-052 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-052.sql
-- ABORTA si el historial de cambios de unidad base tiene filas (es evidencia de auditoría: expórtela antes). Restaura inventario_agregar_linea con el cuerpo de NEX-014
-- (sin FOR SHARE) y un envoltorio de grants con la lista conocida (cada ayudante solo si existe). Después hay que borrar la fila 'NEX-052' de schema_migrations.
-- ADVERTENCIA: sin NEX-052 la aplicación vuelve a rechazar cualquier cambio de unidad base de un producto (la protección contra carreras de stock ya no existe).
DO $$
BEGIN
  IF to_regclass('public.producto_unidad_base_historial') IS NULL THEN
    RAISE EXCEPTION 'producto_unidad_base_historial no existe: NEX-052 no está aplicada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.producto_unidad_base_historial) THEN
    RAISE EXCEPTION 'el historial de unidad base tiene filas: expórtelo antes de revertir (no se pierde auditoría en silencio).';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION inventario_agregar_linea(
  p_empresa uuid, p_movimiento uuid, p_producto uuid, p_cantidad numeric,
  p_costo_unitario numeric DEFAULT NULL, p_lote uuid DEFAULT NULL,
  p_propiedad text DEFAULT 'PROPIO', p_propietario uuid DEFAULT NULL,
  p_precio_venta numeric DEFAULT NULL, p_moneda_venta text DEFAULT NULL, p_valor_total numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE m movimientos_inventario%ROWTYPE; pr record;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_cantidad <> round(p_cantidad, 4) THEN
    RAISE EXCEPTION 'cantidad inválida (%): debe ser > 0 y tener hasta 4 decimales', p_cantidad USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO m FROM movimientos_inventario WHERE empresa_id = p_empresa AND id = p_movimiento;
  IF NOT FOUND THEN RAISE EXCEPTION 'el movimiento % no existe en esta empresa', p_movimiento USING ERRCODE = 'P0001'; END IF;
  SELECT activo, controla_stock, codigo INTO pr FROM productos WHERE empresa_id = p_empresa AND id = p_producto;
  IF NOT FOUND THEN RAISE EXCEPTION 'el producto % no existe en esta empresa', p_producto USING ERRCODE = 'P0001'; END IF;
  -- Un movimiento de anulación puede revertir un producto que luego fue desactivado; el alta nueva no.
  IF NOT pr.activo AND m.tipo_origen <> 'ANULACION' THEN RAISE EXCEPTION 'el producto % está inactivo', pr.codigo USING ERRCODE = 'P0001'; END IF;
  IF NOT pr.controla_stock THEN RAISE EXCEPTION 'el producto % no controla stock', pr.codigo USING ERRCODE = 'P0001'; END IF;
  IF m.tipo_movimiento IN ('RESERVA','LIBERACION_RESERVA','CUARENTENA','LIBERACION_CUARENTENA') THEN
    IF p_costo_unitario IS NOT NULL OR p_precio_venta IS NOT NULL OR p_valor_total IS NOT NULL THEN
      RAISE EXCEPTION 'un cambio de estado de stock no lleva costo ni precio (movimiento %)', m.numero_movimiento USING ERRCODE = 'P0001';
    END IF;
    RETURN inventario_linea_estado(p_empresa, p_movimiento, p_producto, p_cantidad, p_lote, p_propiedad, p_propietario);
  END IF;
  RETURN inventario_registrar_linea(p_empresa, p_movimiento, p_producto, p_cantidad, p_costo_unitario, p_lote,
                                    p_propiedad, p_propietario, p_precio_venta, p_moneda_venta, p_valor_total);
END $$;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE h text;
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  FOREACH h IN ARRAY ARRAY['proveedores', 'fiscal', 'productos', 'comercial', 'depositos', 'facturacion', 'facturacion_emision', 'facturacion_envio', 'clientes'] LOOP
    IF to_regprocedure(format('public.nex_aplicar_grants_%s()', h)) IS NOT NULL THEN
      EXECUTE format('SELECT public.nex_aplicar_grants_%s()', h);
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.nex_aplicar_grants_productos_stock();
DROP FUNCTION IF EXISTS public.producto_cambiar_unidad_base_validar(uuid, uuid, uuid, uuid, uuid);
DROP TRIGGER IF EXISTS producto_unidad_base_historial_inmutable_trg ON public.producto_unidad_base_historial;
DROP TABLE IF EXISTS public.producto_unidad_base_historial;
DROP FUNCTION IF EXISTS public.producto_unidad_base_historial_inmutable();
