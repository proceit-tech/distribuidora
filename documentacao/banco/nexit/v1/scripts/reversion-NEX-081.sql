-- =====================================================================
-- REVERSIÓN de NEX-081 (PRO-354-R02). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 -1 < reversion-NEX-081.sql
-- ANTES desplegar una versión de la aplicación anterior a PRO-354-R02 (la R02 sin NEX-081 lee la política como TRUE y no ofrece el faltante, pero la vista de bajas pendientes
-- y el interruptor responden 503).
-- PROTEGIDA: se DETIENE si existe CUALQUIER baja pendiente (abierta o confirmada: son vínculos FE↔stock que no se pierden) o si alguna empresa tiene la política en FALSE
-- (no se cambia una política vigente sin decisión expresa). Quita también las guardas de producto/depósito de la corrección R01 (las tablas de pendientes ya están vacías).
-- Después borrar la fila 'NEX-081' de schema_migrations. Las FE y los movimientos no se tocan.
-- =====================================================================
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '60s', true);
  IF to_regclass('public.documento_electronico_stock_pendientes') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'bloquear_stock_insuficiente') THEN
    RAISE EXCEPTION 'NEX-081 no está aplicada (o está incompleta): nada que revertir automáticamente.';
  END IF;
  LOCK TABLE public.documento_electronico_stock_pendientes IN EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_stock_pendientes) THEN
    RAISE EXCEPTION 'Existen bajas pendientes registradas (vínculos de FE): la reversión no se ejecuta para no perderlas.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.empresas WHERE NOT bloquear_stock_insuficiente) THEN
    RAISE EXCEPTION 'Hay empresas con la facturación por stock insuficiente PERMITIDA: no se revierte sin decisión expresa del responsable.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_stock_pendientes_preparacion) THEN
    RAISE EXCEPTION 'La tabla de preparación no está vacía (estado inesperado): conciliar antes de revertir.';
  END IF;
END $$;

-- Funciones de NEX-081 (las firmas anteriores no se tocan).
DROP FUNCTION public.nex_aplicar_grants_facturacion_stock_pendientes();
DROP FUNCTION public.fe_stock_pendiente_confirmar(uuid, uuid, uuid);
DROP FUNCTION public.fe_stock_pendientes_listar(uuid, uuid, text, uuid, uuid, text, integer, integer);
DROP FUNCTION public.fe_stock_pendientes_filtros(uuid, uuid);
DROP FUNCTION public.fe_documento_crear_fe_stock_pendiente(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid, jsonb, boolean);
DROP FUNCTION public.fe_stock_politica_contexto(uuid, uuid, uuid, uuid[]);
DROP FUNCTION public.fe_politica_stock_actualizar(uuid, uuid, boolean);

-- Baja de stock: se RESTAURA el cuerpo EXACTO de NEX-067 (copiado literalmente de NEX-067, sección 3).
CREATE OR REPLACE FUNCTION public.fe_stock_baja_documento(p_empresa uuid, p_usuario uuid, p_documento uuid, p_asignaciones jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_doc public.documentos_electronicos%ROWTYPE;
  v_payload jsonb;
  v_hoy date := (now() AT TIME ZONE 'America/Asuncion')::date;
  v_hora time := (now() AT TIME ZONE 'America/Asuncion')::time(0);
  v_asig jsonb := COALESCE(p_asignaciones, '[]'::jsonb);
  v_creados integer := 0;
  v_dep uuid;
  v_mov uuid;
  v_num text;
  v_clave text;
  v_referencia text;
  v_huella text;
  a record;
  b record;
  e record;
  det record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('fe.stock:' || p_empresa::text || ':' || p_documento::text, 0));

  SELECT * INTO v_doc FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo <> 'FE' THEN
    RAISE EXCEPTION 'la factura electrónica no existe en esta empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_doc.sucursal_id) THEN
    RAISE EXCEPTION 'el usuario no puede dar de baja stock de esta factura' USING ERRCODE = '42501';
  END IF;

  -- Repetición: si la FE ya tiene su baja, no se hace nada (idempotente).
  IF EXISTS (SELECT 1 FROM public.documento_electronico_stock_salidas WHERE empresa_id = p_empresa AND documento_id = p_documento) THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(v_asig) <> 'array' THEN
    RAISE EXCEPTION 'el reparto de stock no es válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_REPARTO_INVALIDO';
  END IF;

  SELECT s.payload INTO v_payload FROM public.documento_electronico_solicitudes s WHERE s.empresa_id = p_empresa AND s.documento_id = p_documento ORDER BY s.version DESC LIMIT 1;

  -- PRO-203 / F-002: TODOS los detalles fiscales deben ser verificables. Detalles ausente, vacío o que no sea un arreglo, un detalle sin código o sin cantidad numérica positiva, o con un código que no
  -- corresponde a un producto de la empresa, se RECHAZAN (la FE no se crea). Los servicios legítimos (controla_stock = false) siguen admitidos y no generan movimiento; una mercadería con control de
  -- stock nunca puede quedar fuera de la conciliación de abajo.
  IF v_payload IS NULL OR jsonb_typeof(v_payload->'Detalles') IS DISTINCT FROM 'array' OR jsonb_array_length(v_payload->'Detalles') = 0 THEN
    RAISE EXCEPTION 'la factura no tiene detalles fiscales válidos para conciliar el stock' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PAYLOAD_INVALIDO';
  END IF;
  FOR det IN
    SELECT x.d AS d, p.id AS producto_id
      FROM jsonb_array_elements(v_payload->'Detalles') AS x(d)
      LEFT JOIN public.productos p ON p.empresa_id = p_empresa AND p.codigo = x.d->>'dCodInt'
  LOOP
    IF jsonb_typeof(det.d) IS DISTINCT FROM 'object' OR btrim(COALESCE(det.d->>'dCodInt', '')) = '' OR det.producto_id IS NULL THEN
      RAISE EXCEPTION 'un detalle fiscal no corresponde a un producto conocido de la empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PAYLOAD_INVALIDO';
    END IF;
    IF jsonb_typeof(det.d->'dCantProSer') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'un detalle fiscal no tiene cantidad numérica' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PAYLOAD_INVALIDO';
    END IF;
    IF (det.d->>'dCantProSer')::numeric <= 0 THEN
      RAISE EXCEPTION 'un detalle fiscal tiene cantidad no positiva' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PAYLOAD_INVALIDO';
    END IF;
  END LOOP;

  -- Forma de cada asignación (cantidad > 0 con hasta 4 decimales; producto y depósito de la empresa; depósito activo, propio, de la sucursal de la FE y en el alcance del usuario).
  FOR a IN SELECT x FROM jsonb_array_elements(v_asig) x LOOP
    IF (a.x->>'producto_id') IS NULL OR (a.x->>'deposito_id') IS NULL OR (a.x->>'cantidad') IS NULL
       OR (a.x->>'cantidad')::numeric <= 0 OR (a.x->>'cantidad')::numeric <> round((a.x->>'cantidad')::numeric, 4) THEN
      RAISE EXCEPTION 'el reparto de stock contiene una asignación inválida' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_REPARTO_INVALIDO';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.depositos d WHERE d.empresa_id = p_empresa AND d.id = (a.x->>'deposito_id')::uuid AND d.activo AND NOT d.es_de_terceros AND d.sucursal_id = v_doc.sucursal_id)
       OR NOT public.usuario_puede_deposito(p_empresa, p_usuario, (a.x->>'deposito_id')::uuid) THEN
      RAISE EXCEPTION 'un depósito del reparto no es válido para esta factura (inactivo, de otra sucursal o fuera de su alcance)' USING ERRCODE = '42501', DETAIL = 'NEX:STOCK_DEPOSITO_NO_AUTORIZADO';
    END IF;
  END LOOP;

  -- Conciliación con el payload PERSISTIDO: por cada producto que controla stock, la suma repartida = la cantidad facturada (y nada para otros productos).
  FOR e IN
    SELECT COALESCE(es.producto_id, da.producto_id) AS producto_id, es.cantidad AS esperado, da.cantidad AS repartido
      FROM (SELECT p.id AS producto_id, sum((d->>'dCantProSer')::numeric) AS cantidad
              FROM jsonb_array_elements(COALESCE(v_payload->'Detalles', '[]'::jsonb)) d
              JOIN public.productos p ON p.empresa_id = p_empresa AND p.codigo = d->>'dCodInt' AND p.controla_stock
             GROUP BY p.id) es
      FULL JOIN (SELECT (x->>'producto_id')::uuid AS producto_id, sum((x->>'cantidad')::numeric) AS cantidad FROM jsonb_array_elements(v_asig) x GROUP BY 1) da ON da.producto_id = es.producto_id
  LOOP
    IF e.esperado IS DISTINCT FROM e.repartido THEN
      RAISE EXCEPTION 'el reparto de stock no coincide con la cantidad facturada' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_REPARTO_INVALIDO';
    END IF;
  END LOOP;

  IF jsonb_array_length(v_asig) = 0 THEN
    RETURN 0;
  END IF;

  v_referencia := 'FE ' || v_doc.establecimiento || '-' || v_doc.punto_expedicion || '-' || v_doc.numero;

  -- Un movimiento SALIDA/VENTA por depósito (orden determinista por depósito → sin interbloqueos entre ventas simultáneas).
  FOR v_dep IN SELECT DISTINCT (x->>'deposito_id')::uuid AS d FROM jsonb_array_elements(v_asig) x ORDER BY 1 LOOP
    v_clave := 'FE-STOCK:' || p_documento::text || ':' || v_dep::text;
    SELECT md5(jsonb_agg(jsonb_build_object('p', x->>'producto_id', 'l', x->>'lote_id', 'c', round((x->>'cantidad')::numeric, 4)) ORDER BY x->>'producto_id', x->>'lote_id')::text)
      INTO v_huella FROM jsonb_array_elements(v_asig) x WHERE (x->>'deposito_id')::uuid = v_dep;

    v_num := public.nex_siguiente_numero_movimiento(p_empresa);
    INSERT INTO public.movimientos_inventario (empresa_id, numero_movimiento, tipo_movimiento, tipo_origen, fecha_movimiento, hora_movimiento, sucursal_id, deposito_origen_id,
                                               cliente_id, documento_referencia, motivo, observacion, creado_por, clave_idempotencia, huella_solicitud)
    VALUES (p_empresa, v_num, 'SALIDA', 'VENTA', v_hoy, v_hora, v_doc.sucursal_id, v_dep, v_doc.cliente_id, v_referencia, 'Venta por factura electrónica',
            'Baja automática al emitir ' || v_referencia, p_usuario, v_clave, v_huella)
    RETURNING id INTO v_mov;

    -- Líneas en orden determinista; el saldo se bloquea (FOR UPDATE) y se compara ANTES de llamar al motor de líneas, para informar con un error propio.
    FOR b IN SELECT (x->>'producto_id')::uuid AS producto_id, NULLIF(x->>'lote_id', '')::uuid AS lote_id, sum((x->>'cantidad')::numeric) AS cantidad
               FROM jsonb_array_elements(v_asig) x WHERE (x->>'deposito_id')::uuid = v_dep GROUP BY 1, 2 ORDER BY 1, 2 NULLS FIRST LOOP
      -- Mismo orden de bloqueo que el motor (costo primero, saldo después) para no invertir el orden frente a movimientos manuales simultáneos.
      INSERT INTO public.inventario_costos (empresa_id, producto_id, deposito_id) VALUES (p_empresa, b.producto_id, v_dep) ON CONFLICT (empresa_id, producto_id, deposito_id) DO NOTHING;
      PERFORM 1 FROM public.inventario_costos WHERE empresa_id = p_empresa AND producto_id = b.producto_id AND deposito_id = v_dep FOR UPDATE;
      PERFORM 1 FROM public.stock_saldos s
        WHERE s.empresa_id = p_empresa AND s.producto_id = b.producto_id AND s.deposito_id = v_dep AND s.estado_stock = 'DISPONIBLE' AND s.propiedad = 'PROPIO'
          AND s.propietario_id IS NULL AND s.lote_id IS NOT DISTINCT FROM b.lote_id AND s.cantidad >= b.cantidad FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'stock disponible insuficiente para facturar (producto %, depósito %, cantidad %)',
          (SELECT codigo FROM public.productos WHERE empresa_id = p_empresa AND id = b.producto_id), (SELECT codigo FROM public.depositos WHERE empresa_id = p_empresa AND id = v_dep), b.cantidad
          USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_INSUFICIENTE';
      END IF;
      PERFORM public.inventario_agregar_linea(p_empresa, v_mov, b.producto_id, b.cantidad, NULL, b.lote_id, 'PROPIO', NULL, NULL, NULL, NULL);
    END LOOP;

    INSERT INTO public.documento_electronico_stock_salidas (empresa_id, documento_id, deposito_id, movimiento_id, creado_por) VALUES (p_empresa, p_documento, v_dep, v_mov, p_usuario);
    v_creados := v_creados + 1;
  END LOOP;

  RETURN v_creados;
END $$;
REVOKE ALL ON FUNCTION public.fe_stock_baja_documento(uuid, uuid, uuid, jsonb) FROM PUBLIC;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN REVOKE ALL ON FUNCTION public.fe_stock_baja_documento(uuid, uuid, uuid, jsonb) FROM nexit_runtime; END IF; END $$;

-- R02-R02: sin objetos nuevos (mismas firmas; deposito_en_alcance es de NEX-046 y NO se quita).
-- R01/F001: guardas de integridad sobre productos y depósitos (no se toca ningún otro trigger de esas tablas).
DROP TRIGGER fe_stock_pendientes_producto_guarda_trg ON public.productos;
DROP FUNCTION public.fe_stock_pendientes_producto_guarda();
DROP TRIGGER fe_stock_pendientes_deposito_guarda_trg ON public.depositos;
DROP FUNCTION public.fe_stock_pendientes_deposito_guarda();
DROP TRIGGER fe_stock_pendiente_movimiento_protegido_trg ON public.movimientos_inventario;
DROP FUNCTION public.fe_stock_pendiente_movimiento_protegido();
DROP TRIGGER fe_stock_pendientes_inmutable_trg ON public.documento_electronico_stock_pendientes;
DROP FUNCTION public.fe_stock_pendientes_inmutable();
DROP TABLE public.fe_stock_pendientes_preparacion;
DROP TABLE public.documento_electronico_stock_pendientes;
ALTER TABLE public.empresas DROP COLUMN bloquear_stock_insuficiente;
