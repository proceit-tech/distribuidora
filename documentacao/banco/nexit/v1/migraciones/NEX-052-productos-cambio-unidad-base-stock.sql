-- =====================================================================
-- NEX-052 — Productos: cambio de unidad base protegido contra stock (PRD-A21 / DEC-PRD-U07 / PRD-A29) y envoltorio de grants que no pierde ayudantes.
-- Incremental: NO modifica NEX-001…051 (reemplaza dos funciones con CREATE OR REPLACE y agrega objetos nuevos). NO ejecutar en la VM ni en el banco 'nexit' sin autorización
-- expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-052.sql. Verificación: scripts/verificar-NEX-052.sql. ESTADO: versionada y NO aplicada.
--
-- Problema: la edición de un producto bloquea su fila (FOR UPDATE) pero los escritores de stock (inventario_agregar_linea, vía inventario_registrar_movimiento e
-- inventario_anular_movimiento) leen el producto SIN bloqueo; verificar saldos cero con un SELECT no impide un movimiento concurrente (condición de carrera).
--
-- Solución:
--  1) inventario_agregar_linea: ÚNICO cambio = el producto se lee con FOR SHARE (cuerpo idéntico al de NEX-014). Un movimiento en curso retiene FOR SHARE hasta su COMMIT, por lo
--     que el cambio de unidad espera; y mientras el cambio de unidad retiene FOR UPDATE, un movimiento nuevo espera. Tras la espera, cada lado lee datos confirmados (READ COMMITTED).
--     Orden de bloqueos estable (producto → costos → saldos): sin ciclos.
--  2) producto_cambiar_unidad_base_validar(): SECURITY DEFINER; verifica permiso PRODUCTOS.EDITAR, bloquea el producto, exige que la unidad persistida sea la esperada,
--     que NO exista ningún saldo (cualquier depósito, estado, propiedad o lote) ni cantidad valorizada, y registra el cambio en el historial inmutable.
--     NO bloquea por movimientos históricos concluidos ni por facturas electrónicas congeladas (DEC-PRD-U08); NO exige revisar precios ni recalcula nada (DEC-PRD-U10).
--  3) producto_unidad_base_historial: auditoría inmutable (quién, cuándo, de qué unidad a cuál). Solo la escribe la función.
--  4) nex_aplicar_grants_runtime(): envoltorio que descubre y reaplica TODOS los ayudantes nex_aplicar_grants_* existentes (sin lista fija: no se pierde ninguno, presente o
--     futuro) tras la base.
-- Hasta aplicar esta migración la aplicación RECHAZA cualquier cambio de unidad base de un producto (409).
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.inventario_agregar_linea(uuid,uuid,uuid,numeric,numeric,uuid,text,uuid,numeric,text,numeric)') IS NULL
     OR to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL THEN
    RAISE EXCEPTION 'NEX-052 requiere los movimientos operativos (NEX-014) y la separación de grants (NEX-037).';
  END IF;
  IF to_regclass('public.producto_unidad_base_historial') IS NOT NULL THEN
    RAISE EXCEPTION 'producto_unidad_base_historial ya existe: NEX-052 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

-- 1) Escritores de stock: el producto se lee con FOR SHARE (resto del cuerpo idéntico a NEX-014).
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
  -- NEX-052: FOR SHARE serializa con el cambio de unidad base (que retiene FOR UPDATE sobre la misma fila).
  SELECT activo, controla_stock, codigo INTO pr FROM productos WHERE empresa_id = p_empresa AND id = p_producto FOR SHARE;
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

-- 3) Historial inmutable de cambios de unidad base.
CREATE TABLE public.producto_unidad_base_historial (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid        NOT NULL REFERENCES public.empresas (id),
  producto_id        uuid        NOT NULL,
  unidad_anterior_id uuid        NOT NULL REFERENCES public.unidades_medida (id),
  unidad_nueva_id    uuid        NOT NULL REFERENCES public.unidades_medida (id),
  cambiado_por       uuid        NOT NULL,
  cambiado_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_unidad_base_historial_distinta_chk CHECK (unidad_anterior_id <> unidad_nueva_id),
  CONSTRAINT producto_unidad_base_historial_producto_fk FOREIGN KEY (empresa_id, producto_id) REFERENCES public.productos (empresa_id, id),
  CONSTRAINT producto_unidad_base_historial_usuario_fk FOREIGN KEY (empresa_id, cambiado_por) REFERENCES public.usuarios (empresa_id, id)
);
CREATE INDEX producto_unidad_base_historial_producto_idx ON public.producto_unidad_base_historial (empresa_id, producto_id, cambiado_at DESC);
COMMENT ON TABLE public.producto_unidad_base_historial IS 'Cambios de unidad base de un producto (solo con stock en cero). Inmutable; la escribe únicamente producto_cambiar_unidad_base_validar().';

CREATE OR REPLACE FUNCTION public.producto_unidad_base_historial_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.nex_reinicio_demo_activo(OLD.empresa_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'el historial de unidad base es inmutable' USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER producto_unidad_base_historial_inmutable_trg
  BEFORE UPDATE OR DELETE ON public.producto_unidad_base_historial
  FOR EACH ROW EXECUTE FUNCTION public.producto_unidad_base_historial_inmutable();

-- 2) Validación + registro del cambio (se llama ANTES del UPDATE de productos, en la misma transacción).
CREATE OR REPLACE FUNCTION public.producto_cambiar_unidad_base_validar(p_empresa uuid, p_usuario uuid, p_producto uuid, p_anterior uuid, p_nueva uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actual uuid;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'PRODUCTOS', 'EDITAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso PRODUCTOS.EDITAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_anterior IS NULL OR p_nueva IS NULL OR p_anterior = p_nueva THEN
    RAISE EXCEPTION 'la unidad base nueva debe ser distinta de la actual' USING ERRCODE = 'P0001', DETAIL = 'NEX:UNIDAD_SIN_CAMBIO';
  END IF;

  -- Bloqueo del producto: espera a los movimientos en curso (FOR SHARE) y detiene a los nuevos hasta el COMMIT/ROLLBACK de esta transacción.
  SELECT unidad_medida_id INTO v_actual FROM public.productos WHERE empresa_id = p_empresa AND id = p_producto FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el producto no existe en esta empresa' USING ERRCODE = 'P0001';
  END IF;
  IF v_actual IS DISTINCT FROM p_anterior THEN
    RAISE EXCEPTION 'la unidad base del producto cambió mientras se editaba: recargue la ficha' USING ERRCODE = 'P0001', DETAIL = 'NEX:UNIDAD_CAMBIO_CONCURRENTE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.unidades_medida WHERE id = p_nueva AND activo) THEN
    RAISE EXCEPTION 'la unidad base nueva no existe o está inactiva' USING ERRCODE = 'P0001', DETAIL = 'NEX:UNIDAD_INVALIDA';
  END IF;

  -- Cualquier saldo (todos los depósitos, estados, propiedades y lotes) o cantidad valorizada impide el cambio. Los movimientos históricos NO lo impiden.
  IF EXISTS (SELECT 1 FROM public.stock_saldos WHERE empresa_id = p_empresa AND producto_id = p_producto AND cantidad <> 0) THEN
    RAISE EXCEPTION 'el producto tiene stock: la unidad base solo puede cambiarse con todos los saldos en cero' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_NO_CERO';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventario_costos WHERE empresa_id = p_empresa AND producto_id = p_producto AND (cantidad_valorizada <> 0 OR valor_total <> 0)) THEN
    RAISE EXCEPTION 'el producto tiene cantidad valorizada en el inventario: resuelva la inconsistencia antes de cambiar la unidad base' USING ERRCODE = 'P0001', DETAIL = 'NEX:COSTO_VALORIZADO';
  END IF;

  INSERT INTO public.producto_unidad_base_historial (empresa_id, producto_id, unidad_anterior_id, unidad_nueva_id, cambiado_por)
  VALUES (p_empresa, p_producto, p_anterior, p_nueva, p_usuario);
END $$;

-- Privilegios del rol de la aplicación: solo ejecutar la función; el historial es de solo lectura para ella.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_productos_stock() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  REVOKE ALL ON FUNCTION public.producto_cambiar_unidad_base_validar(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.producto_cambiar_unidad_base_validar(uuid, uuid, uuid, uuid, uuid) TO nexit_runtime;
  REVOKE ALL ON public.producto_unidad_base_historial FROM nexit_runtime;
  GRANT SELECT ON public.producto_unidad_base_historial TO nexit_runtime;
END $$;

-- 4) Envoltorio de grants: la base y luego TODOS los ayudantes nex_aplicar_grants_* existentes (orden alfabético; cada uno es idempotente). Así ningún módulo
--    (Proveedores, Fiscal, Productos, Comercial, Depósitos, Facturación, Clientes, …) pierde sus privilegios al reaplicar y no hay que editar la lista en cada migración.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE h text;
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  FOR h IN SELECT p.proname FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.pronargs = 0 AND p.prorettype = 'void'::regtype
              AND p.proname LIKE 'nex\_aplicar\_grants\_%' AND p.proname NOT IN ('nex_aplicar_grants_runtime', 'nex_aplicar_grants_runtime_base')
            ORDER BY p.proname LOOP
    EXECUTE format('SELECT public.%I()', h);
  END LOOP;
END $$;

SELECT public.nex_aplicar_grants_productos_stock();
