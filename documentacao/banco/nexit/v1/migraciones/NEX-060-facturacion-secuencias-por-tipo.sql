-- =====================================================================
-- NEX-060 — Facturación (PRO-131, AUD-FISC P0): SECUENCIA FISCAL INDEPENDIENTE POR TIPO DE DOCUMENTO.
-- Identidad del sequenciador: empresa + establecimiento SIFEN + punto de expedición + tipo de documento electrónico (FE, NCE, NDE, NRE, AFE).
-- Requiere NEX-048, NEX-057, NEX-058 y NEX-059 (en ese orden). Incremental: NO edita NEX-001…059 (no se sabe qué checksums están instalados en el banco real).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo y consulta del historial real schema_migrations).
-- Reversión: scripts/reversion-NEX-060.sql. ESTADO: versionada y NO aplicada.
--
-- Problema (AUD-FISC-2026-10-15, FISC-001/002/008): fe_puntos_expedicion.ultimo_numero es UN contador por punto, sin tipo; fe_punto_maximo_emitido() ignora el tipo. FE y NCE (misma identidad
-- 001-001) no podrían numerarse de forma independiente (documentos_electronicos ya incluye 'tipo' en su unicidad, NEX-047: el modelo de documentos lo permite, el contador no).
--
-- Solución:
--  · fe_punto_secuencias: UNA fila por (empresa, punto, tipo_documento) con su ultimo_numero. Nunca retrocede ni se elimina (salvo reinicio DEMO). Ningún tipo nace en cero por omisión:
--    la fila existe solo si alguien informó y confirmó el último número real de ESE tipo.
--  · Migración del legado: el contador por punto pasa a la secuencia FE (única espécie que Nexit emitió hasta hoy) SOLO tras conciliarlo con los documentos FE ya registrados
--    (fe_secuencias_conciliar_legado): si algún punto tiene un FE con número MAYOR que su contador, la migración ABORTA completa (nada se aplica) y exige conciliación manual. NO se crea
--    ninguna secuencia para NCE/NDE/NRE/AFE (nunca se copia el valor de FE): quedan «no configuradas» hasta que se informe y confirme su propio último número.
--  · fe_documento_crear_fe (única emisión actual, FE): reserva EXCLUSIVAMENTE la secuencia FE (FOR UPDATE de esa fila). Firma, permisos, idempotencia (entrada_hash), payload, CDC (nunca se
--    fabrica), documentos y solicitudes: sin cambios. Un punto activo SIN secuencia FE no numera (NEX:SECUENCIA_NO_CONFIGURADA, sin consumir número).
--  · fe_punto_maximo_emitido(empresa, establecimiento, código, TIPO): el máximo ya emitido se calcula por tipo (un FE alto no obliga a un NCE a empezar tarde).
--  · fe_punto_crear / fe_punto_activar / fe_punto_desactivar: mismas firmas, permisos, locks (FOR SHARE de la sucursal → advisory lock de identidad → fila del punto), bitácora y mensajes;
--    el «último número emitido» que ya se informa y confirma es el de la secuencia FE (sin pregunta duplicada y sin cambiar la API ni la pantalla actuales).
--  · El contador legado fe_puntos_expedicion.ultimo_numero queda CONGELADO (trigger): conserva el valor histórico y ya no lo escribe nadie (un solo escritor del contador FE).
-- Orden de implantación: primero esta migración y luego el código de la aplicación (que lee fe_punto_secuencias).
-- Qué NO hace: no toca documentos, CDC, payloads, estados, intentos ni claves de idempotencia; no emite NCE/NDE/NRE/AFE; no cambia el gateway.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.fe_punto_crear(uuid,uuid,uuid,text,text,integer,boolean)') IS NULL OR to_regprocedure('public.fe_sucursal_establecimiento_protegido()') IS NULL
     OR to_regprocedure('public.fe_punto_activar(uuid,uuid,uuid,integer,boolean)') IS NULL OR to_regprocedure('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)') IS NULL
     OR coalesce(obj_description('public.fe_punto_crear(uuid,uuid,uuid,text,text,integer,boolean)'::regprocedure, 'pg_proc'), '') NOT LIKE 'NEX-059%' THEN
    RAISE EXCEPTION 'NEX-060 requiere NEX-048, NEX-057, NEX-058 y NEX-059 aplicadas (en ese orden).';
  END IF;
  IF to_regclass('public.fe_punto_secuencias') IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-060 parece aplicada (fe_punto_secuencias ya existe); no se reaplica por suposición.';
  END IF;
END $$;

CREATE TABLE public.fe_punto_secuencias (
  empresa_id      uuid        NOT NULL REFERENCES public.empresas (id),
  punto_id        uuid        NOT NULL,
  tipo_documento  text        NOT NULL CHECK (tipo_documento IN ('FE', 'NCE', 'NDE', 'NRE', 'AFE')),
  ultimo_numero   integer     NOT NULL CHECK (ultimo_numero BETWEEN 0 AND 9999999),
  origen          text        NOT NULL CHECK (origen IN ('MIGRACION_NEX060', 'ALTA_PUNTO', 'ACTIVACION_PUNTO', 'CARGA_MANUAL')),
  creado_at       timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, punto_id, tipo_documento),
  CONSTRAINT fe_punto_secuencias_punto_fk FOREIGN KEY (empresa_id, punto_id) REFERENCES public.fe_puntos_expedicion (empresa_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.fe_punto_secuencias IS 'NEX-060: último número emitido por (empresa, punto de expedición, tipo de documento). Solo crece; ninguna fila se crea con un valor presumido: lo informa y confirma el responsable (o proviene del contador FE legado ya conciliado).';

CREATE OR REPLACE FUNCTION public.fe_secuencias_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.punto_id IS DISTINCT FROM OLD.punto_id OR NEW.tipo_documento IS DISTINCT FROM OLD.tipo_documento THEN
      RAISE EXCEPTION 'la empresa, el punto y el tipo de documento de una secuencia son inmutables' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.ultimo_numero < OLD.ultimo_numero THEN
      RAISE EXCEPTION 'la numeración de una secuencia fiscal nunca retrocede' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND public.nex_reinicio_demo_activo(OLD.empresa_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'una secuencia fiscal no se elimina ni se vacía' USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER fe_punto_secuencias_inmutable_trg BEFORE UPDATE OR DELETE ON public.fe_punto_secuencias FOR EACH ROW EXECUTE FUNCTION public.fe_secuencias_inmutable();
CREATE TRIGGER fe_punto_secuencias_truncate_trg BEFORE TRUNCATE ON public.fe_punto_secuencias FOR EACH STATEMENT EXECUTE FUNCTION public.fe_secuencias_inmutable();

-- Máximo ya emitido por Nexit para ese establecimiento, punto Y TIPO (0 si ninguno). La versión de 3 argumentos de NEX-057 (sin tipo) queda sin uso.
CREATE OR REPLACE FUNCTION public.fe_punto_maximo_emitido(p_empresa uuid, p_establecimiento text, p_codigo text, p_tipo text) RETURNS integer
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(max(numero::int), 0) FROM public.documentos_electronicos
   WHERE empresa_id = p_empresa AND tipo = p_tipo AND establecimiento = p_establecimiento AND punto_expedicion = p_codigo AND numero ~ '^[0-9]{7}$';
$$;

-- Conciliación y migración del contador legado → secuencia FE. p_empresa NULL = todas. Solo toca puntos que aún no tienen secuencia FE. ABORTA (sin insertar nada) si algún punto tiene un FE con
-- número mayor que su contador (no reduce ni inventa: exige conciliación manual). Uso exclusivo de esta migración y de sus pruebas; sin privilegios para el rol de la aplicación.
CREATE OR REPLACE FUNCTION public.fe_secuencias_conciliar_legado(p_empresa uuid DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  r record;
  v_incoherentes text := '';
  v_n integer;
BEGIN
  -- AUD-PRO131-R01-03: bloqueo EXCLUSIVE de la tabla de puntos (se mantiene hasta el fin de la transacción de la migración, que el runner ejecuta con psql -1): espera a que terminen las emisiones
  -- antiguas con el contador ya modificado o con la fila bloqueada (FOR UPDATE) y excluye nuevas lecturas FOR UPDATE / escrituras hasta que el trigger de congelamiento esté instalado. Así el contador que se
  -- copia es el CONSOLIDADO; cualquier emisión del código antiguo que llegue después queda detrás del bloqueo y, al confirmarse la migración, el trigger la rechaza (no reutiliza número).
  LOCK TABLE public.fe_puntos_expedicion IN EXCLUSIVE MODE;
  FOR r IN
    SELECT p.empresa_id, p.codigo, p.ultimo_numero, sc.establecimiento_sifen AS est,
           public.fe_punto_maximo_emitido(p.empresa_id, sc.establecimiento_sifen, p.codigo, 'FE') AS maximo_fe
      FROM public.fe_puntos_expedicion p JOIN public.sucursales sc ON sc.empresa_id = p.empresa_id AND sc.id = p.sucursal_id
     WHERE (p_empresa IS NULL OR p.empresa_id = p_empresa)
       AND NOT EXISTS (SELECT 1 FROM public.fe_punto_secuencias s WHERE s.empresa_id = p.empresa_id AND s.punto_id = p.id AND s.tipo_documento = 'FE')
  LOOP
    IF r.ultimo_numero < r.maximo_fe THEN
      v_incoherentes := v_incoherentes || format(E'\n  empresa %s establecimiento %s punto %s: contador legado %s < FE ya registrado %s', r.empresa_id, coalesce(r.est, '(sin)'), r.codigo, r.ultimo_numero, r.maximo_fe);
    END IF;
  END LOOP;
  IF v_incoherentes <> '' THEN
    RAISE EXCEPTION 'NEX-060 ABORTADA: el contador legado de algún punto es MENOR que el mayor FE registrado; concilie manualmente (no se reduce ni se emite el siguiente por suposición):%', v_incoherentes
      USING ERRCODE = 'P0001', DETAIL = 'NEX:LEGADO_INCONSISTENTE';
  END IF;

  INSERT INTO public.fe_punto_secuencias (empresa_id, punto_id, tipo_documento, ultimo_numero, origen)
  SELECT p.empresa_id, p.id, 'FE', p.ultimo_numero, 'MIGRACION_NEX060'
    FROM public.fe_puntos_expedicion p
   WHERE (p_empresa IS NULL OR p.empresa_id = p_empresa)
     AND NOT EXISTS (SELECT 1 FROM public.fe_punto_secuencias s WHERE s.empresa_id = p.empresa_id AND s.punto_id = p.id AND s.tipo_documento = 'FE');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

SELECT public.fe_secuencias_conciliar_legado(NULL);

-- Un solo escritor del contador FE: el contador legado queda congelado (la migración ya lo copió a la secuencia FE).
CREATE OR REPLACE FUNCTION public.fe_puntos_expedicion_contador_congelado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fe_puntos_expedicion.ultimo_numero está congelado desde NEX-060: la numeración se lleva en fe_punto_secuencias, por tipo de documento' USING ERRCODE = 'P0001', DETAIL = 'NEX:CONTADOR_LEGADO_CONGELADO';
END $$;

CREATE TRIGGER fe_puntos_expedicion_contador_congelado_trg BEFORE UPDATE OF ultimo_numero ON public.fe_puntos_expedicion
  FOR EACH ROW WHEN (NEW.ultimo_numero IS DISTINCT FROM OLD.ultimo_numero) EXECUTE FUNCTION public.fe_puntos_expedicion_contador_congelado();

-- Emisión de la Factura Electrónica (iTiDE = 1): idéntica a NEX-048 salvo la reserva, que usa SOLO la secuencia FE del punto.
CREATE OR REPLACE FUNCTION public.fe_documento_crear_fe(
  p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_cliente uuid, p_receptor_documento text, p_receptor_nombre text,
  p_moneda text, p_total numeric, p_payload jsonb)
RETURNS TABLE (o_documento_id uuid, o_numero text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_entrada text := encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
  v_est text;
  v_punto public.fe_puntos_expedicion%ROWTYPE;
  v_sec public.fe_punto_secuencias%ROWTYPE;
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

  -- Reserva del número. Orden de bloqueos: fila del punto (FOR SHARE: impide activar/desactivar en medio de la emisión, pero NO serializa tipos distintos entre sí) → fila de la secuencia
  -- FE (FOR UPDATE: serializa las emisiones FE de ese punto). Si algo falla después, todo se revierte y el número no se consume.
  SELECT * INTO v_punto FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto AND sucursal_id = p_sucursal AND activo FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe para la sucursal o está inactivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  SELECT * INTO v_sec FROM public.fe_punto_secuencias WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = 'FE' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no tiene secuencia FE configurada: informe y confirme el último número emitido' USING ERRCODE = 'P0001', DETAIL = 'NEX:SECUENCIA_NO_CONFIGURADA';
  END IF;
  IF v_sec.ultimo_numero >= 9999999 THEN
    RAISE EXCEPTION 'la secuencia FE del punto de expedición agotó su numeración' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERACION_AGOTADA';
  END IF;
  v_num := v_sec.ultimo_numero + 1;
  v_numero := lpad(v_num::text, 7, '0');
  UPDATE public.fe_punto_secuencias SET ultimo_numero = v_num, actualizado_at = now() WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = 'FE';

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

COMMENT ON FUNCTION public.fe_documento_crear_fe(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb) IS 'NEX-060: crea la Factura Electrónica reservando exclusivamente la secuencia FE del punto (fe_punto_secuencias).';

-- Alta de punto (NEX-059 + secuencia FE): el «último número emitido» informado y confirmado es el de la secuencia FE.
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
  -- AUD-PRO129-R03-01 (se conserva): el establecimiento se lee BAJO FOR SHARE de la fila de la sucursal antes de fijar la identidad. Orden: fila de la sucursal → lock de identidad → fila del punto.
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
  IF p_ultimo_numero < public.fe_punto_maximo_emitido(p_empresa, v_est, p_codigo, 'FE') THEN
    RAISE EXCEPTION 'el último número informado es menor que el ya emitido por Nexit para ese establecimiento y punto' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_MENOR_QUE_EMITIDOS';
  END IF;

  BEGIN
    -- El contador legado (congelado) nace en 0: la numeración vive en fe_punto_secuencias.
    INSERT INTO public.fe_puntos_expedicion (empresa_id, sucursal_id, codigo, nombre, ultimo_numero, activo)
    VALUES (p_empresa, p_sucursal, p_codigo, btrim(p_nombre), 0, false) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ya existe un punto con ese código en la sucursal' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_DUPLICADO';
  END;
  INSERT INTO public.fe_punto_secuencias (empresa_id, punto_id, tipo_documento, ultimo_numero, origen) VALUES (p_empresa, v_id, 'FE', p_ultimo_numero, 'ALTA_PUNTO');

  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, v_id, p_usuario, 'CREAR', NULL, jsonb_build_object('sucursal_id', p_sucursal, 'codigo', p_codigo, 'nombre', btrim(p_nombre), 'tipo_documento', 'FE', 'ultimo_numero', p_ultimo_numero, 'activo', false));

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.fe_punto_crear(uuid, uuid, uuid, text, text, integer, boolean) IS 'NEX-060: alta de punto de expedición (inactivo) con su secuencia FE (último número informado y confirmado); conserva el FOR SHARE de la sucursal de NEX-059.';

CREATE OR REPLACE FUNCTION public.fe_punto_activar(p_empresa uuid, p_usuario uuid, p_punto uuid, p_ultimo_numero integer, p_confirmado boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_p public.fe_puntos_expedicion%ROWTYPE;
  v_s public.fe_punto_secuencias%ROWTYPE;
  v_est text;
  v_actual integer;
  v_piso integer;
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
  -- Orden de bloqueos: fila del punto → fila de la secuencia FE (igual que la emisión).
  SELECT * INTO v_s FROM public.fe_punto_secuencias WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = 'FE' FOR UPDATE;
  v_actual := CASE WHEN FOUND THEN v_s.ultimo_numero ELSE NULL END;
  -- La numeración solo crece: se confirma el valor guardado o se informa uno MAYOR (se emitió fuera de Nexit); uno menor repetiría números ya usados.
  -- AUD-PRO131-R01-02: sin secuencia FE el piso es el contador legado del punto (cargado a mano o anterior a NEX-060), nunca 0: confirmar un número menor retrocedería respecto de un último número ya conocido.
  v_piso := coalesce(v_actual, v_p.ultimo_numero);
  IF p_ultimo_numero < v_piso OR p_ultimo_numero < public.fe_punto_maximo_emitido(p_empresa, v_est, v_p.codigo, 'FE') THEN
    RAISE EXCEPTION 'el último número informado es menor que el registrado o que el ya emitido por Nexit: la numeración no retrocede' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_MENOR_QUE_EMITIDOS';
  END IF;

  IF v_actual IS NULL THEN
    INSERT INTO public.fe_punto_secuencias (empresa_id, punto_id, tipo_documento, ultimo_numero, origen) VALUES (p_empresa, p_punto, 'FE', p_ultimo_numero, 'ACTIVACION_PUNTO');
  ELSE
    UPDATE public.fe_punto_secuencias SET ultimo_numero = p_ultimo_numero, actualizado_at = now() WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = 'FE';
  END IF;
  UPDATE public.fe_puntos_expedicion SET activo = true, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_punto;

  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, p_punto, p_usuario, 'ACTIVAR', jsonb_build_object('tipo_documento', 'FE', 'ultimo_numero', v_actual, 'activo', false), jsonb_build_object('tipo_documento', 'FE', 'ultimo_numero', p_ultimo_numero, 'activo', true));
END $$;

CREATE OR REPLACE FUNCTION public.fe_punto_desactivar(p_empresa uuid, p_usuario uuid, p_punto uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_p public.fe_puntos_expedicion%ROWTYPE;
  v_ultimo integer;
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
  SELECT ultimo_numero INTO v_ultimo FROM public.fe_punto_secuencias WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = 'FE';

  UPDATE public.fe_puntos_expedicion SET activo = false, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_punto;

  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, p_punto, p_usuario, 'DESACTIVAR', jsonb_build_object('tipo_documento', 'FE', 'ultimo_numero', v_ultimo, 'activo', true), jsonb_build_object('tipo_documento', 'FE', 'ultimo_numero', v_ultimo, 'activo', false));
END $$;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_secuencias() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  -- La aplicación solo LEE las secuencias (para mostrar el siguiente número); las escriben únicamente las funciones SECURITY DEFINER.
  REVOKE ALL ON public.fe_punto_secuencias FROM nexit_runtime;
  GRANT SELECT ON public.fe_punto_secuencias TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_punto_maximo_emitido(uuid, text, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_secuencias_conciliar_legado(uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_secuencias_inmutable() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_puntos_expedicion_contador_congelado() FROM PUBLIC;
END $$;

SELECT public.nex_aplicar_grants_facturacion_secuencias();
SELECT public.nex_aplicar_grants_facturacion_emision();
SELECT public.nex_aplicar_grants_facturacion_puntos();
