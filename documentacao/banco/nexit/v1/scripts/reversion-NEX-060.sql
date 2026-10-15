-- REVERSIÓN manual de NEX-060 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-060.sql
-- Devuelve la numeración al contador único por punto de NEX-048/057/059: copia el último número de la secuencia FE a fe_puntos_expedicion.ultimo_numero (solo hacia arriba, nunca retrocede),
-- restaura los cuerpos anteriores de fe_documento_crear_fe, fe_punto_crear, fe_punto_activar y fe_punto_desactivar y elimina fe_punto_secuencias. NO toca documentos, CDC, payloads ni estados.
-- ABORTA (sin cambiar nada) si existe alguna secuencia de otro tipo (NCE/NDE/NRE/AFE): el modelo anterior no puede representarla y eliminarla perdería numeración confirmada.
-- Después hay que borrar la fila 'NEX-060' de schema_migrations. La versión de 3 argumentos de fe_punto_maximo_emitido (NEX-057) nunca se tocó.
DO $$
BEGIN
  IF to_regclass('public.fe_punto_secuencias') IS NULL THEN
    RAISE EXCEPTION 'NEX-060 no está aplicada (fe_punto_secuencias no existe).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_punto_secuencias WHERE tipo_documento <> 'FE') THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: existen secuencias de otros tipos (NCE/NDE/NRE/AFE); el modelo anterior no las representa. Concilie y retírelas manualmente con autorización expresa.';
  END IF;
END $$;

DROP TRIGGER fe_puntos_expedicion_contador_congelado_trg ON public.fe_puntos_expedicion;

-- Sincroniza el contador legado con la secuencia FE (la secuencia es la fuente actual); el trigger de NEX-048 garantiza que nunca baje.
UPDATE public.fe_puntos_expedicion p SET ultimo_numero = s.ultimo_numero
  FROM public.fe_punto_secuencias s
 WHERE s.empresa_id = p.empresa_id AND s.punto_id = p.id AND s.tipo_documento = 'FE' AND s.ultimo_numero > p.ultimo_numero;

-- Creación de la Factura Electrónica (iTiDE = 1). El payload recibido NO trae dEst/dPunExp/dNumDoc/dSerieNum/dFeEmiDE ni cdc: se completan aquí.
CREATE OR REPLACE FUNCTION public.fe_documento_crear_fe(
  p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_cliente uuid, p_receptor_documento text, p_receptor_nombre text,
  p_moneda text, p_total numeric, p_payload jsonb)
RETURNS TABLE (o_documento_id uuid, o_numero text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_entrada text := encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
  v_est text;
  v_punto public.fe_puntos_expedicion%ROWTYPE;
  v_num integer;
  v_numero text;
  v_id uuid;
  v_payload jsonb;
  v_previo public.documentos_electronicos%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_clave IS NULL OR char_length(p_clave) NOT BETWEEN 8 AND 120 THEN
    RAISE EXCEPTION 'la clave de idempotencia es obligatoria (8 a 120 caracteres)' USING ERRCODE = 'P0001';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR p_payload ? 'cdc' OR p_payload ? 'dNumDoc' OR (p_payload->>'iTiDE') IS DISTINCT FROM '1'
     OR (p_payload->'Subtotales'->0->>'dTotGralOpe')::numeric IS DISTINCT FROM p_total THEN
    RAISE EXCEPTION 'el payload de la factura no es válido (debe ser iTiDE 1, sin cdc ni número, con el mismo total)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
  END IF;

  -- Idempotencia: misma clave y mismo contenido → el documento ya creado, sin consumir número.
  SELECT d.* INTO v_previo FROM public.documentos_electronicos d WHERE d.empresa_id = p_empresa AND d.clave_idempotencia = p_clave;
  IF FOUND THEN
    IF NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_previo.sucursal_id)
       OR NOT EXISTS (SELECT 1 FROM public.documento_electronico_solicitudes s WHERE s.empresa_id = p_empresa AND s.documento_id = v_previo.id AND s.entrada_hash = v_entrada) THEN
      RAISE EXCEPTION 'la clave de idempotencia ya se usó con otro contenido' USING ERRCODE = 'P0001', DETAIL = 'NEX:IDEMPOTENCIA_CONFLICTO';
    END IF;
    RETURN QUERY SELECT v_previo.id, v_previo.numero, true;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal AND activo) OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal) THEN
    RAISE EXCEPTION 'la sucursal no existe, está inactiva o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:SUCURSAL_INVALIDA';
  END IF;
  SELECT establecimiento_sifen INTO v_est FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal;
  IF v_est IS NULL THEN
    RAISE EXCEPTION 'la sucursal no tiene establecimiento SIFEN configurado' USING ERRCODE = 'P0001', DETAIL = 'NEX:SIN_ESTABLECIMIENTO';
  END IF;
  IF p_cliente IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clientes WHERE empresa_id = p_empresa AND id = p_cliente AND activo AND NOT bloqueado_ventas) THEN
    RAISE EXCEPTION 'el cliente no existe, está inactivo o bloqueado para ventas' USING ERRCODE = 'P0001', DETAIL = 'NEX:CLIENTE_INVALIDO';
  END IF;

  -- Reserva del número bajo bloqueo del punto. Si algo falla después, todo se revierte y el número no se consume.
  SELECT * INTO v_punto FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto AND sucursal_id = p_sucursal AND activo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe para la sucursal o está inactivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  IF v_punto.ultimo_numero >= 9999999 THEN
    RAISE EXCEPTION 'el punto de expedición agotó su numeración' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERACION_AGOTADA';
  END IF;
  v_num := v_punto.ultimo_numero + 1;
  v_numero := lpad(v_num::text, 7, '0');
  UPDATE public.fe_puntos_expedicion SET ultimo_numero = v_num, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_punto;

  v_payload := p_payload || jsonb_build_object('dEst', v_est, 'dPunExp', v_punto.codigo, 'dNumDoc', v_numero, 'dSerieNum', NULL,
                                               'dFeEmiDE', to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYY-MM-DD"T"HH24:MI:SS'));

  INSERT INTO public.documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, serie, fecha_emision, cliente_id, receptor_documento,
                                              receptor_nombre, moneda, total, clave_idempotencia, creado_por)
  VALUES (p_empresa, p_sucursal, 'FE', v_est, v_punto.codigo, v_numero, NULL, now(), p_cliente, nullif(btrim(coalesce(p_receptor_documento, '')), ''),
          p_receptor_nombre, p_moneda, p_total, p_clave, p_usuario)
  RETURNING id INTO v_id;

  INSERT INTO public.documento_electronico_solicitudes (empresa_id, documento_id, version, payload, payload_hash, entrada_hash, creado_por)
  VALUES (p_empresa, v_id, 1, v_payload, encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex'), v_entrada, p_usuario);

  RETURN QUERY SELECT v_id, v_numero, false;
END $$;

CREATE OR REPLACE FUNCTION public.fe_punto_crear(p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_codigo text, p_nombre text, p_ultimo_numero integer, p_confirmado boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_est text;
  v_activa boolean;
  v_id uuid;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_confirmado IS NOT TRUE THEN
    RAISE EXCEPTION 'confirme que el último número emitido es correcto' USING ERRCODE = 'P0001', DETAIL = 'NEX:CONFIRMACION_REQUERIDA';
  END IF;
  IF p_ultimo_numero IS NULL OR p_ultimo_numero NOT BETWEEN 0 AND 9999998 THEN
    RAISE EXCEPTION 'informe el último número realmente emitido (0 a 9999998)' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_INVALIDO';
  END IF;
  IF p_codigo IS NULL OR p_codigo !~ '^[0-9]{3}$' OR p_codigo = '000' THEN
    RAISE EXCEPTION 'el código del punto debe tener 3 dígitos (001 a 999)' USING ERRCODE = 'P0001', DETAIL = 'NEX:CODIGO_INVALIDO';
  END IF;
  IF p_nombre IS NULL OR char_length(btrim(p_nombre)) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'el nombre del punto debe tener de 1 a 60 caracteres' USING ERRCODE = 'P0001', DETAIL = 'NEX:NOMBRE_INVALIDO';
  END IF;
  -- AUD-PRO129-R03-01: el establecimiento se lee BAJO EL BLOQUEO de la fila de la sucursal (FOR SHARE, que dura hasta el fin de la transacción) ANTES de fijar la identidad, tomar el lock de identidad,
  -- comprobar el uso y insertar. Un cambio de establecimiento concurrente (que necesita el bloqueo exclusivo de la fila) espera a que esta transacción termine —y entonces el trigger de NEX-058 lo rechaza
  -- porque ya hay un punto—; y si el cambio ya estaba en curso, esta lectura espera a su confirmación y ve el valor DEFINITIVO. Orden de bloqueos: fila de la sucursal → lock de identidad → fila del punto.
  SELECT establecimiento_sifen, activo INTO v_est, v_activa FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal FOR SHARE;
  IF NOT FOUND OR NOT v_activa OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal) THEN
    RAISE EXCEPTION 'la sucursal no existe, está inactiva o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:SUCURSAL_INVALIDA';
  END IF;
  IF v_est IS NULL THEN
    RAISE EXCEPTION 'la sucursal no tiene establecimiento SIFEN configurado' USING ERRCODE = 'P0001', DETAIL = 'NEX:SIN_ESTABLECIMIENTO';
  END IF;
  PERFORM public.fe_punto_bloquear_identidad(p_empresa, v_est, p_codigo);
  IF public.fe_punto_identidad_en_uso(p_empresa, v_est, p_codigo, p_sucursal, NULL, false) THEN
    RAISE EXCEPTION 'el establecimiento % con el código % ya está configurado en otra sucursal: dos puntos con la misma identidad fiscal colisionarían en la numeración', v_est, p_codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:IDENTIDAD_FISCAL_DUPLICADA';
  END IF;
  IF p_ultimo_numero < public.fe_punto_maximo_emitido(p_empresa, v_est, p_codigo) THEN
    RAISE EXCEPTION 'el último número informado es menor que el ya emitido por Nexit para ese establecimiento y punto' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_MENOR_QUE_EMITIDOS';
  END IF;

  BEGIN
    INSERT INTO public.fe_puntos_expedicion (empresa_id, sucursal_id, codigo, nombre, ultimo_numero, activo)
    VALUES (p_empresa, p_sucursal, p_codigo, btrim(p_nombre), p_ultimo_numero, false) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ya existe un punto con ese código en la sucursal' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_DUPLICADO';
  END;

  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, v_id, p_usuario, 'CREAR', NULL, jsonb_build_object('sucursal_id', p_sucursal, 'codigo', p_codigo, 'nombre', btrim(p_nombre), 'ultimo_numero', p_ultimo_numero, 'activo', false));

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.fe_punto_crear(uuid, uuid, uuid, text, text, integer, boolean) IS 'NEX-059: alta de punto de expedición (inactivo); lee el establecimiento de la sucursal bajo FOR SHARE antes de fijar la identidad fiscal.';
COMMENT ON FUNCTION public.fe_documento_crear_fe(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb) IS NULL;

CREATE OR REPLACE FUNCTION public.fe_punto_activar(p_empresa uuid, p_usuario uuid, p_punto uuid, p_ultimo_numero integer, p_confirmado boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_p public.fe_puntos_expedicion%ROWTYPE;
  v_est text;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_confirmado IS NOT TRUE THEN
    RAISE EXCEPTION 'confirme que el último número emitido es correcto' USING ERRCODE = 'P0001', DETAIL = 'NEX:CONFIRMACION_REQUERIDA';
  END IF;
  IF p_ultimo_numero IS NULL OR p_ultimo_numero NOT BETWEEN 0 AND 9999998 THEN
    RAISE EXCEPTION 'informe el último número realmente emitido (0 a 9999998)' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_INVALIDO';
  END IF;

  -- Primero se lee SIN bloquear para conocer la identidad; se serializa por identidad (advisory lock) y recién entonces se bloquea la fila y se re-lee con el estado confirmado.
  SELECT * INTO v_p FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sucursales WHERE empresa_id = p_empresa AND id = v_p.sucursal_id AND activo) OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_p.sucursal_id) THEN
    RAISE EXCEPTION 'la sucursal no existe, está inactiva o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:SUCURSAL_INVALIDA';
  END IF;
  SELECT establecimiento_sifen INTO v_est FROM public.sucursales WHERE empresa_id = p_empresa AND id = v_p.sucursal_id;
  IF v_est IS NULL THEN
    RAISE EXCEPTION 'la sucursal no tiene establecimiento SIFEN configurado' USING ERRCODE = 'P0001', DETAIL = 'NEX:SIN_ESTABLECIMIENTO';
  END IF;
  PERFORM public.fe_punto_bloquear_identidad(p_empresa, v_est, v_p.codigo);
  SELECT * INTO v_p FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto FOR UPDATE;
  IF v_p.activo THEN
    RAISE EXCEPTION 'el punto ya está activo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_YA_ACTIVO';
  END IF;
  IF public.fe_punto_identidad_en_uso(p_empresa, v_est, v_p.codigo, v_p.sucursal_id, v_p.id, true) THEN
    RAISE EXCEPTION 'otro punto activo de otra sucursal ya usa el establecimiento % y el código %: desactívelo antes o use otro código', v_est, v_p.codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:IDENTIDAD_FISCAL_DUPLICADA';
  END IF;
  -- La numeración solo crece: se confirma el valor guardado o se informa uno MAYOR (se emitió fuera de Nexit); uno menor repetiría números ya usados.
  IF p_ultimo_numero < v_p.ultimo_numero OR p_ultimo_numero < public.fe_punto_maximo_emitido(p_empresa, v_est, v_p.codigo) THEN
    RAISE EXCEPTION 'el último número informado es menor que el registrado o que el ya emitido por Nexit: la numeración no retrocede' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_MENOR_QUE_EMITIDOS';
  END IF;

  UPDATE public.fe_puntos_expedicion SET ultimo_numero = p_ultimo_numero, activo = true, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_punto;

  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, p_punto, p_usuario, 'ACTIVAR', jsonb_build_object('ultimo_numero', v_p.ultimo_numero, 'activo', false), jsonb_build_object('ultimo_numero', p_ultimo_numero, 'activo', true));
END $$;

CREATE OR REPLACE FUNCTION public.fe_punto_desactivar(p_empresa uuid, p_usuario uuid, p_punto uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_p public.fe_puntos_expedicion%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_p FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  IF NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_p.sucursal_id) THEN
    RAISE EXCEPTION 'la sucursal está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:SUCURSAL_INVALIDA';
  END IF;
  IF NOT v_p.activo THEN
    RAISE EXCEPTION 'el punto ya está inactivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_YA_INACTIVO';
  END IF;

  UPDATE public.fe_puntos_expedicion SET activo = false, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_punto;

  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, p_punto, p_usuario, 'DESACTIVAR', jsonb_build_object('ultimo_numero', v_p.ultimo_numero, 'activo', true), jsonb_build_object('ultimo_numero', v_p.ultimo_numero, 'activo', false));
END $$;

DROP FUNCTION public.fe_secuencias_conciliar_legado(uuid);
DROP FUNCTION public.fe_punto_maximo_emitido(uuid, text, text, text);
DROP FUNCTION public.nex_aplicar_grants_facturacion_secuencias();
DROP TABLE public.fe_punto_secuencias;
DROP FUNCTION public.fe_secuencias_inmutable();
DROP FUNCTION public.fe_puntos_expedicion_contador_congelado();

SELECT public.nex_aplicar_grants_facturacion_emision();
SELECT public.nex_aplicar_grants_facturacion_puntos();
