-- =====================================================================
-- NEX-067 — Facturación E02 (PRO-200): control de stock y baja de inventario al EMITIR la Factura Electrónica.
-- Reglas aprobadas (REQ-CASA-MINGO-DECISIONES, sección 5.A):
--   * Solo cuenta el stock DISPONIBLE y PROPIO de depósitos ACTIVOS de la sucursal que emite, dentro del alcance del usuario (usuario_puede_deposito); reservado, cuarentena y tránsito no cuentan.
--   * Venta por encima del disponible → BLOQUEADA (NEX:STOCK_INSUFICIENTE), bajo bloqueo de filas: no hay saldo negativo ni doble consumo concurrente.
--   * La baja ocurre en la MISMA transacción que la creación de la FE (o se crea todo o nada): fe_documento_crear_fe_con_stock() envuelve la función de emisión existente (sin tocar NEX-048/063/065).
--   * Una FE con varios depósitos genera UN movimiento SALIDA/VENTA por depósito, vinculado a la FE (documento_electronico_stock_salidas); la FE conserva una única línea fiscal por producto.
--   * Las líneas usan el motor de líneas de Inventario (inventario_agregar_linea → inventario_registrar_linea: costo promedio congelado, saldo y valorización); el encabezado se crea con la misma estructura
--     que inventario_registrar_movimiento, pero la autorización es FACTURACION_ELECTRONICA.CREAR + alcance de depósito (facturar no exige MOVIMIENTOS.CREAR). NEX-014 no se modifica.
--   * Idempotencia: la clave del movimiento es 'FE-STOCK:<documento>:<depósito>' (única por empresa) y la tabla de vínculos tiene PK (documento, depósito): repetir la emisión, una consulta o un clic no baja dos veces.
--   * El reparto (producto, depósito, lote, cantidad) lo calcula y MUESTRA la aplicación; aquí se REVALIDA bajo bloqueo y se concilia con el payload persistido (nunca se sustituye en silencio).
--   * Cantidades Decimal con hasta 4 decimales (5,5 reduce 5,5). Productos que no controlan stock (servicios) no se tocan.
-- NO incluye: reversión por rechazo definitivo ni por cancelación SIFEN (E10), ni NCE (no mueve stock).
-- ESTADO: versionada y NO aplicada. Ningún agente de IA la aplica: la ejecuta SOLO el responsable en la VM (docs/PROCEDIMIENTO-NEX-067.md). Primero la migración, después el código.
-- =====================================================================

DO $$
BEGIN
  IF to_regprocedure('public.inventario_registrar_movimiento(uuid,uuid,text,text,date,uuid,uuid,jsonb,text,uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.inventario_agregar_linea(uuid,uuid,uuid,numeric,numeric,uuid,text,uuid,numeric,text,numeric)') IS NULL THEN
    RAISE EXCEPTION 'NEX-067 requiere el motor de inventario (NEX-014).';
  END IF;
  IF to_regprocedure('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)') IS NULL OR to_regclass('public.documentos_electronicos') IS NULL THEN
    RAISE EXCEPTION 'NEX-067 requiere la emisión de FE (NEX-048/NEX-065).';
  END IF;
  IF to_regprocedure('public.sucursal_en_alcance(uuid,uuid,uuid)') IS NULL OR to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL THEN
    RAISE EXCEPTION 'NEX-067 requiere NEX-046 (alcance de sucursal) y la separación de grants (NEX-037/NEX-052).';
  END IF;
  IF to_regclass('public.documento_electronico_stock_salidas') IS NOT NULL THEN
    RAISE EXCEPTION 'documento_electronico_stock_salidas ya existe: NEX-067 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

-- 1) Vínculo auditable FE ↔ salida de inventario (uno por depósito). Inmutable.
CREATE TABLE public.documento_electronico_stock_salidas (
  empresa_id    uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id  uuid        NOT NULL,
  deposito_id   uuid        NOT NULL,
  movimiento_id uuid        NOT NULL,
  creado_por    uuid        NOT NULL,
  creado_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, documento_id, deposito_id),
  CONSTRAINT fe_stock_salidas_movimiento_uk UNIQUE (empresa_id, movimiento_id),
  CONSTRAINT fe_stock_salidas_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.documentos_electronicos (empresa_id, id),
  CONSTRAINT fe_stock_salidas_movimiento_fk FOREIGN KEY (empresa_id, movimiento_id) REFERENCES public.movimientos_inventario (empresa_id, id),
  CONSTRAINT fe_stock_salidas_deposito_fk FOREIGN KEY (empresa_id, deposito_id) REFERENCES public.depositos (empresa_id, id)
);
COMMENT ON TABLE public.documento_electronico_stock_salidas IS 'NEX-067: salida de inventario (SALIDA/VENTA) generada al emitir una FE, una por depósito. Sin acceso directo para la aplicación; inmutable.';

CREATE OR REPLACE FUNCTION public.fe_stock_salidas_inmutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF public.nex_reinicio_demo_activo(OLD.empresa_id) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'documento_electronico_stock_salidas es inmutable (evidencia de la baja de stock de la FE)' USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER fe_stock_salidas_inmutable_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_stock_salidas
  FOR EACH ROW EXECUTE FUNCTION public.fe_stock_salidas_inmutable();

-- 1b) PRO-202 / F-001: un movimiento de salida vinculado a una FE NO se puede anular manualmente. inventario_anular_movimiento (NEX-014, aplicada, sin cambios) crea el movimiento inverso y luego pasa el original a
--     ANULADO; este disparador (BEFORE UPDATE OF estado, se ejecuta antes que movimientos_inventario_guard_trg por orden alfabético) rechaza esa transición y, al ser la misma transacción, también se deshace el
--     movimiento inverso: no se repone stock, aunque el usuario tenga MOVIMIENTOS.ANULAR o sea administrador. La reposición solo la hará el futuro procedimiento fiscal de cancelación oficial (E10), que deberá
--     reemplazar esta función con su propia vía auditable; hoy no existe ninguna.
CREATE OR REPLACE FUNCTION public.fe_stock_movimiento_protegido() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.estado = 'ANULADO' AND OLD.estado IS DISTINCT FROM 'ANULADO'
     AND EXISTS (SELECT 1 FROM public.documento_electronico_stock_salidas s WHERE s.empresa_id = OLD.empresa_id AND s.movimiento_id = OLD.id) THEN
    RAISE EXCEPTION 'el movimiento % está vinculado a una factura electrónica y no se puede anular manualmente: solo la cancelación oficial de la factura puede revertir su stock', OLD.numero_movimiento
      USING ERRCODE = 'P0001', DETAIL = 'NEX:MOVIMIENTO_VINCULADO_FE';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER fe_stock_movimiento_protegido_trg BEFORE UPDATE OF estado ON public.movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION public.fe_stock_movimiento_protegido();

-- 2) Disponibilidad por depósito (SOLO LECTURA) para mostrar y calcular el reparto. Mismo filtro que la baja.
CREATE OR REPLACE FUNCTION public.fe_stock_disponibilidad(p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_productos uuid[])
RETURNS TABLE (o_producto_id uuid, o_deposito_id uuid, o_deposito_codigo text, o_deposito_nombre text, o_lote_id uuid, o_lote_codigo text, o_vencimiento date, o_disponible numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal) THEN
    RAISE EXCEPTION 'la sucursal está fuera del alcance del usuario' USING ERRCODE = '42501';
  END IF;
  IF p_productos IS NULL OR cardinality(p_productos) = 0 OR cardinality(p_productos) > 500 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT s.producto_id, d.id, d.codigo, d.nombre, s.lote_id, l.codigo_lote, l.fecha_vencimiento, s.cantidad
      FROM public.stock_saldos s
      JOIN public.depositos d ON d.empresa_id = s.empresa_id AND d.id = s.deposito_id AND d.activo AND NOT d.es_de_terceros AND d.sucursal_id = p_sucursal
      JOIN public.productos pr ON pr.empresa_id = s.empresa_id AND pr.id = s.producto_id AND pr.controla_stock
      LEFT JOIN public.stock_lotes l ON l.empresa_id = s.empresa_id AND l.producto_id = s.producto_id AND l.id = s.lote_id
     WHERE s.empresa_id = p_empresa AND s.producto_id = ANY (p_productos)
       AND s.estado_stock = 'DISPONIBLE' AND s.propiedad = 'PROPIO' AND s.cantidad > 0
       AND public.usuario_puede_deposito(p_empresa, p_usuario, d.id)
     ORDER BY d.codigo, l.fecha_vencimiento NULLS LAST, s.lote_id NULLS FIRST;
END $$;

-- 3) Baja de stock de UNA FE (interna: solo la invoca fe_documento_crear_fe_con_stock; el rol de la aplicación NO la ejecuta).
--    p_asignaciones: [{producto_id, deposito_id, lote_id|null, cantidad}]. Devuelve cuántos movimientos (depósitos) creó; 0 si la FE ya tenía su baja (repetición) o no hay productos con control de stock.
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

-- 4) Emisión atómica: crea la FE (función existente, sin cambios) y, en la MISMA transacción, da de baja el stock. Una repetición de la misma clave devuelve la FE existente SIN tocar el stock.
CREATE OR REPLACE FUNCTION public.fe_documento_crear_fe_con_stock(
  p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_cliente uuid, p_receptor_documento text, p_receptor_nombre text,
  p_moneda text, p_total numeric, p_payload jsonb, p_asignaciones jsonb)
RETURNS TABLE (o_documento_id uuid, o_numero text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid; v_numero text; v_reutilizado boolean;
BEGIN
  SELECT c.o_documento_id, c.o_numero, c.o_reutilizado INTO v_id, v_numero, v_reutilizado
    FROM public.fe_documento_crear_fe(p_empresa, p_usuario, p_sucursal, p_punto, p_clave, p_cliente, p_receptor_documento, p_receptor_nombre, p_moneda, p_total, p_payload) c;

  IF NOT v_reutilizado THEN
    PERFORM public.fe_stock_baja_documento(p_empresa, p_usuario, v_id, p_asignaciones);
  END IF;

  RETURN QUERY SELECT v_id, v_numero, v_reutilizado;
END $$;

-- 5) Grants: la aplicación solo EJECUTA la lectura y la emisión atómica; la tabla y la baja interna no son accesibles. La creación de FE SIN baja (fe_documento_crear_fe) deja de ser ejecutable por la aplicación.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_stock() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  REVOKE ALL ON public.documento_electronico_stock_salidas FROM PUBLIC;
  REVOKE ALL ON public.documento_electronico_stock_salidas FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_stock_baja_documento(uuid, uuid, uuid, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_stock_baja_documento(uuid, uuid, uuid, jsonb) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_stock_disponibilidad(uuid, uuid, uuid, uuid[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_con_stock(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_stock_disponibilidad(uuid, uuid, uuid, uuid[]) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_crear_fe_con_stock(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb) TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_fe(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb) FROM nexit_runtime;
END $$;

REVOKE ALL ON FUNCTION public.fe_stock_salidas_inmutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_stock_movimiento_protegido() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_stock_baja_documento(uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_stock_disponibilidad(uuid, uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_con_stock(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_stock() FROM PUBLIC;

SELECT public.nex_aplicar_grants_facturacion_stock();
