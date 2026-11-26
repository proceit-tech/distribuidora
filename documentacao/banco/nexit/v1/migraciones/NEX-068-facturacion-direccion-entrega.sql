-- =====================================================================
-- NEX-068 — Facturación E04 (PRO-200): dirección de ENTREGA elegida en la Factura Electrónica.
-- Reglas aprobadas (REQ-CASA-MINGO-DECISIONES §7, HANDOFF FE-END):
--   * El operador elige un destino entre las direcciones YA registradas del cliente de la factura (direcciones_cliente); la que está marcada es_entrega_default se preselecciona; no se crean direcciones desde la FE.
--   * Destinos elegibles (PRO-206) = TODAS las direcciones registradas del cliente que no sean exclusivamente el domicilio FISCAL (ENTREGA, SUCURSAL, COMERCIAL —tipo por defecto de las filiales heredadas— y OTRA); el domicilio fiscal (es_fiscal o
--     tipo FISCAL) solo es destino si está explícitamente marcado es_entrega_default. Una única función (fe_entrega_elegible) aplica la MISMA regla en la consulta, la validación y la emisión. Si el cliente no tiene ninguno, la FE se emite
--     SIN destino (no se inventa ni se copia la dirección fiscal) y no se guarda fila.
--   * Si el cliente tiene destinos elegibles, la FE debe llevar uno (NEX:ENTREGA_REQUERIDA); un destino que no pertenece a ese cliente/empresa, o que ya no es elegible, se rechaza (NEX:ENTREGA_INVALIDA) y TODA la
--     transacción se deshace (ni FE, ni numeración, ni baja de stock).
--   * Se guarda la referencia y una FOTOGRAFÍA (snapshot) del destino vinculada a la FE (documento_electronico_entregas): trazable aunque luego se edite o se ELIMINE la dirección del catálogo (PRO-205: direccion_id es una
--     referencia histórica SIN clave foránea, para no bloquear Clientes → Direcciones; la pertenencia a la empresa y al cliente se valida bajo bloqueo en la emisión). Inmutable.
--   * El domicilio fiscal del receptor, el establecimiento/punto emisor, el payload SIFEN, el KuDE, las reglas fiscales y el stock NO cambian: el destino es solo un dato logístico interno.
--   * Idempotencia: repetir la emisión (misma clave) devuelve la FE existente y NO toca el destino original.
-- Requiere NEX-067 (envoltorio de emisión con stock). ESTADO: versionada y NO aplicada. Ningún agente de IA la aplica: la ejecuta SOLO el responsable en la VM (docs/PROCEDIMIENTO-NEX-068.md). Primero la migración, después el código.
-- =====================================================================

DO $$
BEGIN
  IF to_regprocedure('public.fe_documento_crear_fe_con_stock(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'NEX-068 requiere NEX-067 (emisión de FE con baja de stock).';
  END IF;
  IF to_regclass('public.direcciones_cliente') IS NULL OR to_regclass('public.documentos_electronicos') IS NULL THEN
    RAISE EXCEPTION 'NEX-068 requiere los clientes (NEX-005) y los documentos electrónicos (NEX-047).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL THEN
    RAISE EXCEPTION 'NEX-068 requiere la separación de grants (NEX-037/NEX-052).';
  END IF;
  IF to_regclass('public.documento_electronico_entregas') IS NOT NULL THEN
    RAISE EXCEPTION 'documento_electronico_entregas ya existe: NEX-068 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

-- 1) Destino de entrega elegido para cada FE (una fila como máximo; sin fila = sin destino). Inmutable.
CREATE TABLE public.documento_electronico_entregas (
  empresa_id   uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id uuid        NOT NULL,
  cliente_id   uuid        NOT NULL,
  direccion_id uuid        NOT NULL, -- referencia HISTÓRICA (sin FK): la dirección del catálogo puede editarse o eliminarse después; la fotografía (snapshot) es la evidencia
  snapshot     jsonb       NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND pg_column_size(snapshot) < 8192),
  creado_por   uuid        NOT NULL,
  creado_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, documento_id),
  CONSTRAINT fe_entregas_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.documentos_electronicos (empresa_id, id)
);
COMMENT ON TABLE public.documento_electronico_entregas IS 'NEX-068: destino de entrega (referencia + fotografía) elegido al emitir la FE. Sin acceso directo para la aplicación; inmutable.';

CREATE OR REPLACE FUNCTION public.fe_entregas_inmutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF public.nex_reinicio_demo_activo(OLD.empresa_id) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'documento_electronico_entregas es inmutable (fotografía del destino de la FE)' USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER fe_entregas_inmutable_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_entregas
  FOR EACH ROW EXECUTE FUNCTION public.fe_entregas_inmutable();

-- 1b) Regla ÚNICA de elegibilidad (PRO-206): cualquier dirección registrada que no sea exclusivamente el domicilio fiscal; el fiscal solo si está marcado como predeterminado de entrega.
CREATE OR REPLACE FUNCTION public.fe_entrega_elegible(p_tipo text, p_es_fiscal boolean, p_es_default boolean) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_es_default OR (NOT p_es_fiscal AND p_tipo <> 'FISCAL')
$$;

-- 2) Destinos elegibles del cliente (SOLO LECTURA): la lista que muestra la pantalla y la regla que valida el servidor son la MISMA.
CREATE OR REPLACE FUNCTION public.fe_entrega_opciones(p_empresa uuid, p_usuario uuid, p_cliente uuid)
RETURNS TABLE (o_id uuid, o_tipo text, o_etiqueta text, o_descripcion text, o_direccion text, o_numero_casa text, o_complemento text, o_departamento text, o_distrito text, o_ciudad text, o_pais text,
               o_contacto_nombre text, o_contacto_telefono text, o_horario text, o_es_default boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT d.id, d.tipo, d.etiqueta::text, d.descripcion::text, d.direccion::text, d.numero_casa::text, d.complemento::text, d.departamento::text, d.distrito::text, d.ciudad::text, d.pais_codigo,
           d.contacto_nombre::text, d.contacto_telefono::text, d.horario_recepcion::text, d.es_entrega_default
      FROM public.direcciones_cliente d
     WHERE d.empresa_id = p_empresa AND d.cliente_id = p_cliente
       AND public.fe_entrega_elegible(d.tipo, d.es_fiscal, d.es_entrega_default)
     ORDER BY d.es_entrega_default DESC, lower(coalesce(nullif(btrim(d.etiqueta), ''), nullif(btrim(d.descripcion), ''), d.direccion)), d.id;
END $$;

-- 3) Emisión atómica con destino: crea la FE con baja de stock (NEX-067) y, en la MISMA transacción, valida y registra el destino. Repetición de la clave → FE existente, sin tocar el destino original.
CREATE OR REPLACE FUNCTION public.fe_documento_crear_fe_con_stock_entrega(
  p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_cliente uuid, p_receptor_documento text, p_receptor_nombre text,
  p_moneda text, p_total numeric, p_payload jsonb, p_asignaciones jsonb, p_direccion_entrega uuid)
RETURNS TABLE (o_documento_id uuid, o_numero text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid; v_numero text; v_reutilizado boolean;
  v_dir public.direcciones_cliente%ROWTYPE;
  v_hay boolean;
BEGIN
  SELECT c.o_documento_id, c.o_numero, c.o_reutilizado INTO v_id, v_numero, v_reutilizado
    FROM public.fe_documento_crear_fe_con_stock(p_empresa, p_usuario, p_sucursal, p_punto, p_clave, p_cliente, p_receptor_documento, p_receptor_nombre, p_moneda, p_total, p_payload, p_asignaciones) c;

  IF NOT v_reutilizado THEN
    SELECT EXISTS (SELECT 1 FROM public.direcciones_cliente d WHERE d.empresa_id = p_empresa AND d.cliente_id = p_cliente AND public.fe_entrega_elegible(d.tipo, d.es_fiscal, d.es_entrega_default)) INTO v_hay;

    IF p_direccion_entrega IS NULL THEN
      IF v_hay THEN
        RAISE EXCEPTION 'el cliente tiene direcciones de entrega registradas: seleccione una' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENTREGA_REQUERIDA';
      END IF;
    ELSE
      SELECT d.* INTO v_dir FROM public.direcciones_cliente d
       WHERE d.empresa_id = p_empresa AND d.cliente_id = p_cliente AND d.id = p_direccion_entrega AND public.fe_entrega_elegible(d.tipo, d.es_fiscal, d.es_entrega_default) FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'la dirección de entrega no pertenece al cliente de la factura o ya no está disponible' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENTREGA_INVALIDA';
      END IF;

      INSERT INTO public.documento_electronico_entregas (empresa_id, documento_id, cliente_id, direccion_id, snapshot, creado_por)
      VALUES (p_empresa, v_id, p_cliente, v_dir.id,
              jsonb_strip_nulls(jsonb_build_object('tipo', v_dir.tipo, 'etiqueta', v_dir.etiqueta, 'descripcion', v_dir.descripcion, 'direccion', v_dir.direccion, 'numeroCasa', v_dir.numero_casa,
                'complemento', v_dir.complemento, 'departamento', v_dir.departamento, 'distrito', v_dir.distrito, 'ciudad', v_dir.ciudad, 'pais', v_dir.pais_codigo,
                'contactoNombre', v_dir.contacto_nombre, 'contactoTelefono', v_dir.contacto_telefono, 'horarioRecepcion', v_dir.horario_recepcion, 'esPredeterminada', v_dir.es_entrega_default)),
              p_usuario);
    END IF;
  END IF;

  RETURN QUERY SELECT v_id, v_numero, v_reutilizado;
END $$;

-- 4) Grants (el ayudante se llama ..._stock_entrega para ejecutarse DESPUÉS de nex_aplicar_grants_facturacion_stock, que concede la emisión de NEX-067: el envoltorio global los reaplica en orden alfabético): la aplicación ejecuta la lectura de destinos y la emisión con destino; la tabla no es accesible. La emisión de NEX-067 sin destino deja de ser ejecutable por la aplicación (una sola vía de emisión).
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_stock_entrega() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  REVOKE ALL ON public.documento_electronico_entregas FROM PUBLIC;
  REVOKE ALL ON public.documento_electronico_entregas FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_entrega_opciones(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_con_stock_entrega(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_entrega_opciones(uuid, uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_crear_fe_con_stock_entrega(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid) TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_con_stock(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb) FROM nexit_runtime;
END $$;

REVOKE ALL ON FUNCTION public.fe_entregas_inmutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_entrega_elegible(text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_entrega_opciones(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_con_stock_entrega(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_stock_entrega() FROM PUBLIC;

SELECT public.nex_aplicar_grants_facturacion_stock_entrega();
