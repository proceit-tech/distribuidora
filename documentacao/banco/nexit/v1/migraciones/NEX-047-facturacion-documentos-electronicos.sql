-- =====================================================================
-- NEX-047 — Facturación F-01: documentos electrónicos (modelo persistente), intentos de consulta al gateway, configuración del gateway por empresa y
-- permisos FACTURACION_ELECTRONICA.VER / EDITAR. Requiere NEX-002 (empresas, sucursales, usuarios, usuario_sucursal), NEX-005 (clientes), NEX-012
-- (nex_reinicio_demo_activo), NEX-014 (usuario_tiene_permiso) y NEX-046 (sucursal_en_alcance y el envoltorio de grants de depósitos).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-047.sql.
-- ESTADO: versionada y NO aplicada. Si alguna vez se comprueba que ya se aplicó, no se edita: se prepara una incremental.
--
-- Alcance F-01 (solo lo confirmado por la especificación c1a8d63; ver REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA-2026-10-12.md):
--  · documentos_electronicos: identidad (tipo, establecimiento, punto de expedición, número, serie), CDC (opcional hasta que el gateway lo informe),
--    instantánea del receptor y del total, y estados SEPARADOS: estado_local (envío), estado_sifen, estado_email. HTTP 200 del gateway NO equivale a
--    «aprobado»: estado_sifen solo toma el valor que el gateway informa en el campo Estado y los valores desconocidos quedan en NO_RECONOCIDO.
--    Los archivos PDF/XML NO se modelan: sus endpoints no están confirmados (no se inventan columnas ni URLs).
--  · documento_electronico_intentos: evidencia inmutable (solo altas) de cada consulta (y, en F-02, envío) con HTTP, resultado, respuesta saneada.
--  · fe_gateway_config: URL base HTTPS y REFERENCIA del secreto (nombre lógico) por empresa. NUNCA contiene ruc/clave/token: las credenciales viven
--    en variables de entorno del servidor.
--  · Escritura solo por funciones SECURITY DEFINER; el rol de la aplicación solo lee. F-01 no crea documentos (la emisión es F-02); la única
--    función es fe_documento_registrar_consulta (EDITAR + sucursal en alcance), que registra el intento y actualiza estados en una transacción.
--  · Sin movimiento de stock; sin exportación ni contratación pública; sin notas de crédito (F-03).
-- No modifica ninguna fila existente salvo insertar los dos permisos (sin asignarlos a perfiles).
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.sucursales') IS NULL OR to_regclass('public.usuarios') IS NULL OR to_regclass('public.clientes') IS NULL
     OR to_regclass('public.usuario_sucursal') IS NULL OR to_regclass('public.permisos') IS NULL THEN
    RAISE EXCEPTION 'NEX-047 requiere NEX-002 (empresas, sucursales, usuarios, usuario_sucursal, permisos) y NEX-005 (clientes).';
  END IF;
  IF to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NULL OR to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'NEX-047 requiere NEX-012 (nex_reinicio_demo_activo) y NEX-014 (usuario_tiene_permiso).';
  END IF;
  IF to_regprocedure('public.sucursal_en_alcance(uuid,uuid,uuid)') IS NULL OR to_regprocedure('public.nex_aplicar_grants_depositos()') IS NULL THEN
    RAISE EXCEPTION 'NEX-047 requiere NEX-046 (sucursal_en_alcance y nex_aplicar_grants_depositos): aplíquela antes.';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL OR to_regprocedure('public.nex_aplicar_grants_proveedores()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_fiscal()') IS NULL OR to_regprocedure('public.nex_aplicar_grants_productos()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_comercial()') IS NULL THEN
    RAISE EXCEPTION 'NEX-047 requiere el envoltorio de grants del runtime (NEX-037/039/041/045).';
  END IF;
  IF to_regclass('public.documentos_electronicos') IS NOT NULL OR to_regclass('public.documento_electronico_intentos') IS NOT NULL
     OR to_regclass('public.fe_gateway_config') IS NOT NULL THEN
    RAISE EXCEPTION 'las tablas de documentos electrónicos ya existen: NEX-047 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

-- 1) Permisos (sin asignarlos a perfiles: el administrador de la empresa los tiene por definición; el resto, por decisión expresa del responsable).
INSERT INTO public.permisos (codigo, recurso, accion, modulo, nivel_alcance, clase)
SELECT r || '.' || a, r, a, 'facturacion', 'SUCURSAL', 'OPERACIONAL'
  FROM (VALUES ('FACTURACION_ELECTRONICA','VER'), ('FACTURACION_ELECTRONICA','EDITAR')) t(r, a)
ON CONFLICT (codigo) DO NOTHING;

-- 2) Configuración del gateway por empresa (sin secretos).
CREATE TABLE public.fe_gateway_config (
  empresa_id      uuid        PRIMARY KEY REFERENCES public.empresas (id),
  base_url        text        NOT NULL CHECK (base_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?$'),
  credencial_ref  text        NOT NULL CHECK (credencial_ref ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  timeout_ms      integer     NOT NULL DEFAULT 15000 CHECK (timeout_ms BETWEEN 1000 AND 60000),
  activo          boolean     NOT NULL DEFAULT true,
  creado_at       timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fe_gateway_config IS 'Gateway de facturación electrónica por empresa. credencial_ref es el nombre lógico de las variables de entorno NEXIT_FE_<REF>_RUC / NEXIT_FE_<REF>_PASSWORD del servidor; nunca se guardan credenciales aquí.';

-- 3) Documentos electrónicos.
CREATE TABLE public.documentos_electronicos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid        NOT NULL REFERENCES public.empresas (id),
  sucursal_id         uuid        NOT NULL,
  tipo                text        NOT NULL CHECK (tipo IN ('FE','NCE','NDE','NRE','AFE')),
  establecimiento     text        NOT NULL CHECK (establecimiento ~ '^[0-9]{3}$'),
  punto_expedicion    text        NOT NULL CHECK (punto_expedicion ~ '^[0-9]{3}$'),
  numero              text        NOT NULL CHECK (numero ~ '^[0-9]{7}$'),
  serie               text        CHECK (serie IS NULL OR serie ~ '^[A-Z]{2}$'),
  cdc                 text        CHECK (cdc IS NULL OR cdc ~ '^[0-9]{44}$'),
  fecha_emision       timestamptz NOT NULL,
  cliente_id          uuid,
  receptor_documento  text,
  receptor_nombre     text        NOT NULL CHECK (length(btrim(receptor_nombre)) > 0),
  moneda              text        NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
  total               numeric(20,4) NOT NULL CHECK (total >= 0),
  estado_local        text        NOT NULL DEFAULT 'PENDIENTE_ENVIO' CHECK (estado_local IN ('PENDIENTE_ENVIO','ENVIO_INDETERMINADO','ENVIADO','ERROR_ENVIO')),
  estado_sifen        text        NOT NULL DEFAULT 'SIN_CONSULTA' CHECK (estado_sifen IN ('SIN_CONSULTA','PENDIENTE','APROBADO','RECHAZADO','CANCELADO','INUTILIZADO','NO_RECONOCIDO')),
  estado_email        text        NOT NULL DEFAULT 'NO_INFORMADO' CHECK (estado_email IN ('NO_INFORMADO','SIN_EMAIL','PENDIENTE','ENVIADO','ERROR')),
  estado_gateway_texto text,
  cod_respuesta       text,
  mensaje_respuesta   text        CHECK (mensaje_respuesta IS NULL OR char_length(mensaje_respuesta) <= 500),
  fecha_firma_gateway text,
  fecha_envio_gateway text,
  ultima_consulta_at  timestamptz,
  ultima_consulta_resultado text,
  clave_idempotencia  text        CHECK (clave_idempotencia IS NULL OR char_length(clave_idempotencia) BETWEEN 8 AND 120),
  creado_por          uuid        NOT NULL,
  creado_at           timestamptz NOT NULL DEFAULT now(),
  actualizado_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentos_electronicos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT documentos_electronicos_sucursal_fk FOREIGN KEY (empresa_id, sucursal_id) REFERENCES public.sucursales (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT documentos_electronicos_cliente_fk  FOREIGN KEY (empresa_id, cliente_id)  REFERENCES public.clientes (empresa_id, id) ON DELETE SET NULL (cliente_id),
  CONSTRAINT documentos_electronicos_creador_fk  FOREIGN KEY (empresa_id, creado_por)  REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE
);

-- Un mismo número fiscal no se repite dentro de la empresa; el CDC y la clave de idempotencia identifican de forma única un documento.
CREATE UNIQUE INDEX documentos_electronicos_numero_key ON public.documentos_electronicos (empresa_id, tipo, establecimiento, punto_expedicion, numero, coalesce(serie, ''));
CREATE UNIQUE INDEX documentos_electronicos_cdc_key ON public.documentos_electronicos (empresa_id, cdc) WHERE cdc IS NOT NULL;
CREATE UNIQUE INDEX documentos_electronicos_idempotencia_key ON public.documentos_electronicos (empresa_id, clave_idempotencia) WHERE clave_idempotencia IS NOT NULL;
CREATE INDEX documentos_electronicos_lista_idx ON public.documentos_electronicos (empresa_id, fecha_emision DESC, id);
CREATE INDEX documentos_electronicos_estado_idx ON public.documentos_electronicos (empresa_id, estado_sifen, estado_local);

COMMENT ON TABLE public.documentos_electronicos IS 'Documentos electrónicos emitidos por la empresa. Los estados local (envío), SIFEN y e-mail son independientes; solo estado_sifen refleja lo informado por el gateway, nunca se infiere del HTTP 200.';

-- 4) Intentos (evidencia inmutable).
CREATE TABLE public.documento_electronico_intentos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id    uuid        NOT NULL,
  tipo            text        NOT NULL CHECK (tipo IN ('CONSULTA','ENVIO')),
  resultado       text        NOT NULL CHECK (resultado IN ('OK','NO_ENCONTRADO','ERROR_HTTP','TIMEOUT','RED','RESPUESTA_INVALIDA','CDC_DIVERGENTE')),
  http_status     integer     CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  request_id      text        CHECK (request_id IS NULL OR char_length(request_id) <= 80),
  estado_gateway  text,
  estado_sifen    text,
  cod_respuesta   text,
  mensaje         text        CHECK (mensaje IS NULL OR char_length(mensaje) <= 500),
  respuesta       jsonb       CHECK (respuesta IS NULL OR pg_column_size(respuesta) < 65536),
  actor_id        uuid        NOT NULL,
  creado_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documento_electronico_intentos_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.documentos_electronicos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT documento_electronico_intentos_actor_fk FOREIGN KEY (empresa_id, actor_id) REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE
);

CREATE INDEX documento_electronico_intentos_doc_idx ON public.documento_electronico_intentos (empresa_id, documento_id, creado_at DESC);

COMMENT ON TABLE public.documento_electronico_intentos IS 'Evidencia (solo altas) de cada consulta/envío al gateway. La respuesta se guarda saneada: sin tokens, claves ni cabeceras de autorización.';

-- 5) Inmutabilidad. DELETE solo durante el reinicio/eliminación de una empresa DEMO (cascada de NEX-012).
CREATE OR REPLACE FUNCTION public.fe_documentos_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION '% es un registro fiscal: no se vacía.', TG_TABLE_NAME USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT public.nex_reinicio_demo_activo(OLD.empresa_id) THEN
      RAISE EXCEPTION '% es un registro fiscal: no se elimina.', TG_TABLE_NAME USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: la evidencia de intentos nunca cambia; en documentos solo cambian estados, datos de respuesta y el CDC (una única vez: NULL → valor).
  IF TG_TABLE_NAME = 'documento_electronico_intentos' THEN
    RAISE EXCEPTION 'documento_electronico_intentos es de solo altas: no se modifica.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.establecimiento IS DISTINCT FROM OLD.establecimiento OR NEW.punto_expedicion IS DISTINCT FROM OLD.punto_expedicion
     OR NEW.numero IS DISTINCT FROM OLD.numero OR NEW.serie IS DISTINCT FROM OLD.serie OR NEW.fecha_emision IS DISTINCT FROM OLD.fecha_emision
     OR NEW.receptor_nombre IS DISTINCT FROM OLD.receptor_nombre OR NEW.receptor_documento IS DISTINCT FROM OLD.receptor_documento
     OR NEW.moneda IS DISTINCT FROM OLD.moneda OR NEW.total IS DISTINCT FROM OLD.total OR NEW.clave_idempotencia IS DISTINCT FROM OLD.clave_idempotencia
     OR NEW.creado_por IS DISTINCT FROM OLD.creado_por OR NEW.creado_at IS DISTINCT FROM OLD.creado_at THEN
    RAISE EXCEPTION 'la identidad y los importes de un documento electrónico son inmutables' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_INMUTABLE';
  END IF;
  IF OLD.cdc IS NOT NULL AND NEW.cdc IS DISTINCT FROM OLD.cdc THEN
    RAISE EXCEPTION 'el CDC de un documento electrónico no cambia una vez informado' USING ERRCODE = 'P0001', DETAIL = 'NEX:CDC_INMUTABLE';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER documentos_electronicos_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.documentos_electronicos
  FOR EACH ROW EXECUTE FUNCTION public.fe_documentos_inmutable();
CREATE TRIGGER documentos_electronicos_inmutable_truncate_trg BEFORE TRUNCATE ON public.documentos_electronicos
  FOR EACH STATEMENT EXECUTE FUNCTION public.fe_documentos_inmutable();
CREATE TRIGGER documento_electronico_intentos_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_intentos
  FOR EACH ROW EXECUTE FUNCTION public.fe_documentos_inmutable();
CREATE TRIGGER documento_electronico_intentos_inmutable_truncate_trg BEFORE TRUNCATE ON public.documento_electronico_intentos
  FOR EACH STATEMENT EXECUTE FUNCTION public.fe_documentos_inmutable();

-- 6) Registro transaccional de una consulta al gateway. La consulta HTTP la hace el servidor FUERA de la transacción; aquí solo se persiste el
-- resultado ya interpretado: intento (evidencia) + estados del documento, con la fila bloqueada.
CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_resultado text := p_resultado;
  v_mensaje text := left(nullif(btrim(coalesce(p_mensaje, '')), ''), 500);
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'EDITAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.EDITAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_resultado IS NULL OR p_resultado NOT IN ('OK','NO_ENCONTRADO','ERROR_HTTP','TIMEOUT','RED','RESPUESTA_INVALIDA') THEN
    RAISE EXCEPTION 'resultado de consulta no válido' USING ERRCODE = 'P0001';
  END IF;
  IF p_resultado = 'OK' AND (p_estado_sifen IS NULL OR p_estado_sifen NOT IN ('PENDIENTE','APROBADO','RECHAZADO','CANCELADO','INUTILIZADO','NO_RECONOCIDO')) THEN
    RAISE EXCEPTION 'estado SIFEN no válido para una consulta satisfactoria' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;

  -- El CDC informado no puede contradecir el ya guardado: se registra el intento como divergente y NO se toca el documento.
  IF p_resultado = 'OK' AND p_cdc IS NOT NULL AND d.cdc IS NOT NULL AND p_cdc <> d.cdc THEN
    v_resultado := 'CDC_DIVERGENTE';
  END IF;

  INSERT INTO public.documento_electronico_intentos (empresa_id, documento_id, tipo, resultado, http_status, request_id, estado_gateway, estado_sifen, cod_respuesta, mensaje, respuesta, actor_id)
  VALUES (p_empresa, p_documento, 'CONSULTA', v_resultado, p_http, left(p_request_id, 80), p_estado_gateway,
          CASE WHEN v_resultado = 'OK' THEN p_estado_sifen END, p_cod_respuesta, v_mensaje, p_respuesta, p_usuario);

  IF v_resultado = 'OK' THEN
    UPDATE public.documentos_electronicos SET
      estado_sifen = p_estado_sifen,
      estado_gateway_texto = left(p_estado_gateway, 120),
      cdc = coalesce(d.cdc, p_cdc),
      cod_respuesta = p_cod_respuesta,
      mensaje_respuesta = v_mensaje,
      fecha_firma_gateway = coalesce(left(p_fecha_firma, 60), d.fecha_firma_gateway),
      fecha_envio_gateway = coalesce(left(p_fecha_envio, 60), d.fecha_envio_gateway),
      -- Que el gateway conozca el documento reconcilia un envío dudoso o fallido: ya fue recibido.
      estado_local = 'ENVIADO',
      ultima_consulta_at = now(), ultima_consulta_resultado = 'OK', actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_documento;
  ELSE
    -- NO_ENCONTRADO, errores y tiempos de espera: solo se anota la consulta; el estado fiscal NO cambia (no se finge un rechazo).
    UPDATE public.documentos_electronicos SET ultima_consulta_at = now(), ultima_consulta_resultado = v_resultado, actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_documento;
  END IF;

  RETURN v_resultado;
END $$;

-- 7) Privilegios: el rol de la aplicación solo lee las tablas y ejecuta la función.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  REVOKE ALL ON public.documentos_electronicos, public.documento_electronico_intentos, public.fe_gateway_config FROM nexit_runtime;
  GRANT SELECT ON public.documentos_electronicos, public.documento_electronico_intentos, public.fe_gateway_config TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_consulta(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_consulta(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb) TO nexit_runtime;
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
END $$;

SELECT public.nex_aplicar_grants_facturacion();
