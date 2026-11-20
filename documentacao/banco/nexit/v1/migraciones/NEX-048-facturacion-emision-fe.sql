-- =====================================================================
-- NEX-048 — Facturación F-02 (preparación de la emisión de Factura Electrónica): puntos de expedición con numeración, solicitud de emisión inmutable
-- (payload FE) y creación transaccional e idempotente del documento. Requiere NEX-047 (y, por ella, NEX-046).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-048.sql.
-- ESTADO: versionada y NO aplicada.
--
-- Qué hace y qué NO hace:
--  · fe_puntos_expedicion: punto de expedición (3 dígitos) por sucursal y su último número usado. El establecimiento sale de
--    sucursales.establecimiento_sifen. Solo lectura para la aplicación; la configuración inicial la hace el responsable (ver nota abajo). El timbrado
--    NO se modela: el payload FE conocido no lo transporta y su gestión pertenece al gateway.
--  · documento_electronico_solicitudes: el payload FE que se enviará (jsonb) con su huella, inmutable. Es la fuente del reintento y de la reconciliación;
--    NO es evidencia de envío (el envío a recepcion_de aún no existe: el documento queda en PENDIENTE_ENVIO).
--  · fe_documento_crear_fe(): bajo bloqueo del punto de expedición reserva el siguiente número, completa en el payload SOLO dEst/dPunExp/dNumDoc/
--    dSerieNum/dFeEmiDE (nunca el CDC: no se fabrica), crea el documento y su solicitud en la misma transacción. Idempotente por clave: repetir la misma
--    clave con el mismo contenido devuelve el documento existente SIN consumir número; con otro contenido se rechaza. Si algo falla, el número no se consume.
--  · Sin envío al gateway, sin respuestas inventadas, sin PDF/XML, sin movimiento de stock.
-- NOTA DE PUESTA EN MARCHA (responsable): antes de emitir, cargar el punto con ultimo_numero = último número YA emitido para ese establecimiento y punto
-- (también por otros sistemas), para no repetir numeración. Ninguna migración inserta puntos de expedición.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.documentos_electronicos') IS NULL OR to_regprocedure('public.fe_documento_registrar_consulta(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_facturacion()') IS NULL THEN
    RAISE EXCEPTION 'NEX-048 requiere NEX-047 (documentos electrónicos).';
  END IF;
  IF to_regclass('public.fe_puntos_expedicion') IS NOT NULL OR to_regclass('public.documento_electronico_solicitudes') IS NOT NULL THEN
    RAISE EXCEPTION 'las tablas de emisión ya existen: NEX-048 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

INSERT INTO public.permisos (codigo, recurso, accion, modulo, nivel_alcance, clase)
VALUES ('FACTURACION_ELECTRONICA.CREAR', 'FACTURACION_ELECTRONICA', 'CREAR', 'facturacion', 'SUCURSAL', 'OPERACIONAL')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE public.fe_puntos_expedicion (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid        NOT NULL REFERENCES public.empresas (id),
  sucursal_id     uuid        NOT NULL,
  codigo          text        NOT NULL CHECK (codigo ~ '^[0-9]{3}$'),
  nombre          text        NOT NULL CHECK (length(btrim(nombre)) > 0),
  ultimo_numero   integer     NOT NULL DEFAULT 0 CHECK (ultimo_numero BETWEEN 0 AND 9999999),
  activo          boolean     NOT NULL DEFAULT true,
  creado_at       timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fe_puntos_expedicion_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT fe_puntos_expedicion_codigo_key UNIQUE (empresa_id, sucursal_id, codigo),
  CONSTRAINT fe_puntos_expedicion_sucursal_fk FOREIGN KEY (empresa_id, sucursal_id) REFERENCES public.sucursales (empresa_id, id) ON DELETE CASCADE
);

CREATE TABLE public.documento_electronico_solicitudes (
  empresa_id     uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id   uuid        NOT NULL,
  version        smallint    NOT NULL DEFAULT 1 CHECK (version >= 1),
  payload        jsonb       NOT NULL CHECK (pg_column_size(payload) < 262144),
  payload_hash   text        NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  entrada_hash   text        NOT NULL CHECK (entrada_hash ~ '^[0-9a-f]{64}$'),
  creado_por     uuid        NOT NULL,
  creado_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, documento_id, version),
  CONSTRAINT documento_electronico_solicitudes_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.documentos_electronicos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT documento_electronico_solicitudes_creador_fk FOREIGN KEY (empresa_id, creado_por) REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.documento_electronico_solicitudes IS 'Payload FE inmutable de cada documento (payload_hash = huella del payload completo; entrada_hash = huella de lo enviado por la aplicación antes de asignar número, base de la idempotencia). No prueba envío.';

-- Inmutabilidad: puntos de expedición (identidad fija; el último número solo crece) y solicitudes (solo altas; DELETE solo en reinicio DEMO).
CREATE OR REPLACE FUNCTION public.fe_emision_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'fe_puntos_expedicion' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id OR NEW.codigo IS DISTINCT FROM OLD.codigo THEN
        RAISE EXCEPTION 'la empresa, la sucursal y el código de un punto de expedición son inmutables' USING ERRCODE = 'P0001';
      END IF;
      IF NEW.ultimo_numero < OLD.ultimo_numero THEN
        RAISE EXCEPTION 'la numeración de un punto de expedición nunca retrocede' USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' AND public.nex_reinicio_demo_activo(OLD.empresa_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'un punto de expedición no se elimina ni se vacía' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' AND public.nex_reinicio_demo_activo(OLD.empresa_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% es de solo altas', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER fe_puntos_expedicion_inmutable_trg BEFORE UPDATE OR DELETE ON public.fe_puntos_expedicion FOR EACH ROW EXECUTE FUNCTION public.fe_emision_inmutable();
CREATE TRIGGER fe_puntos_expedicion_truncate_trg BEFORE TRUNCATE ON public.fe_puntos_expedicion FOR EACH STATEMENT EXECUTE FUNCTION public.fe_emision_inmutable();
CREATE TRIGGER documento_electronico_solicitudes_inmutable_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_solicitudes FOR EACH ROW EXECUTE FUNCTION public.fe_emision_inmutable();
CREATE TRIGGER documento_electronico_solicitudes_truncate_trg BEFORE TRUNCATE ON public.documento_electronico_solicitudes FOR EACH STATEMENT EXECUTE FUNCTION public.fe_emision_inmutable();

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

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_emision() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  REVOKE ALL ON public.fe_puntos_expedicion, public.documento_electronico_solicitudes FROM nexit_runtime;
  GRANT SELECT ON public.fe_puntos_expedicion, public.documento_electronico_solicitudes TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_fe(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_documento_crear_fe(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb) TO nexit_runtime;
END $$;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
  PERFORM public.nex_aplicar_grants_fiscal();
  PERFORM public.nex_aplicar_grants_productos();
  PERFORM public.nex_aplicar_grants_comercial();
  PERFORM public.nex_aplicar_grants_depositos();
  PERFORM public.nex_aplicar_grants_facturacion();
  PERFORM public.nex_aplicar_grants_facturacion_emision();
END $$;

SELECT public.nex_aplicar_grants_facturacion_emision();
