-- =====================================================================
-- NEX-071 — NCE E1-R03 (PRO-292 / PRO-300): observación ORIGINAL del operador, inmutable, junto a la NCE.
-- Problema: nce_origen.observacion guarda el dInfAdic COMPUESTO (observaciones + bloque automático «Vendedor»). A partir de ese texto no se puede probar qué escribió el operador
-- (ni para precargar la corrección de una NCE rechazada sin perder texto, ni para decidir si un reintento con la misma clave trae el MISMO contenido).
--   * Tabla nce_observaciones_originales (solo altas, anclada a nce_origen, aislada por empresa): una fila por NCE NUEVA con la cadena CRUDA recibida, sin recortar ni normalizar (puede ser '' o solo espacios; conserva saltos de línea). Las NCE anteriores a esta
--     migración NO tienen fila y NO se reclasifican: su procedencia sigue siendo desconocida (la aplicación las trata de forma conservadora).
--   * fe_documento_crear_nce_obs (12 parámetros): envuelve SIN COPIARLA a fe_documento_crear_nce (misma lógica, permisos, numeración, idempotencia, saldos) y, en la MISMA transacción, inserta la fila cuando
--     la NCE es nueva. Si el documento ya existía (reutilizado) no escribe nada: no se fabrica procedencia. fe_documento_crear_nce no se modifica.
-- No cambia el JSON enviado al proveedor ni el XML. Independiente de NEX-066…069; requiere NEX-062 y NEX-070 (fe_documento_crear_nce).
-- =====================================================================
CREATE TABLE public.nce_observaciones_originales (
  empresa_id  uuid        NOT NULL,
  nce_id      uuid        NOT NULL,
  observacion text        NOT NULL CHECK (char_length(observacion) <= 5000),
  creado_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, nce_id),
  CONSTRAINT nce_observaciones_originales_nce_fk FOREIGN KEY (empresa_id, nce_id) REFERENCES public.nce_origen (empresa_id, nce_id) ON DELETE CASCADE
);
COMMENT ON TABLE public.nce_observaciones_originales IS 'NEX-071: observación EXACTA escrita por el operador al crear la NCE (sin el bloque automático del dInfAdic). Solo NCE posteriores a la migración; solo altas.';

CREATE TRIGGER nce_observaciones_originales_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.nce_observaciones_originales FOR EACH ROW EXECUTE FUNCTION public.nce_solo_altas();
CREATE TRIGGER nce_observaciones_originales_inmutable_truncate_trg BEFORE TRUNCATE ON public.nce_observaciones_originales FOR EACH STATEMENT EXECUTE FUNCTION public.nce_solo_altas();

CREATE OR REPLACE FUNCTION public.fe_documento_crear_nce_obs(
  p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_fe uuid, p_motivo integer, p_lineas jsonb, p_moneda text, p_total numeric, p_payload jsonb, p_observacion_original text)
RETURNS TABLE (o_documento_id uuid, o_numero text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
  v_numero text;
  v_reutilizado boolean;
  v_original text;
BEGIN
  -- La observación es la cadena CRUDA del operador (sin trim); el dInfAdic del payload se compone aparte (recortado) y no se relaciona byte a byte con ella.
  IF p_observacion_original IS NULL OR char_length(p_observacion_original) > 5000 THEN
    RAISE EXCEPTION 'la observación original no es válida (obligatoria, hasta 5000 caracteres)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
  END IF;

  -- Toda la lógica fiscal (permiso, idempotencia, saldos, numeración, persistencia) es la de fe_documento_crear_nce; esta función solo añade el registro de la observación original.
  SELECT r.o_documento_id, r.o_numero, r.o_reutilizado INTO v_id, v_numero, v_reutilizado
    FROM public.fe_documento_crear_nce(p_empresa, p_usuario, p_sucursal, p_punto, p_clave, p_fe, p_motivo, p_lineas, p_moneda, p_total, p_payload) r;

  IF NOT v_reutilizado THEN
    INSERT INTO public.nce_observaciones_originales (empresa_id, nce_id, observacion) VALUES (p_empresa, v_id, p_observacion_original);
  ELSE
    -- E1-R05-F001 (PRO-303): fe_documento_crear_nce identifica la repetición por el hash del payload fiscal, que NO incluye la observación cruda (distintas observaciones pueden componer el mismo dInfAdic).
    -- Una reutilización solo es legítima si la observación original registrada para ESA NCE (misma empresa) es exactamente la recibida. Sin registro confiable (NCE anterior a NEX-071) no se acepta una reutilización ambigua.
    -- Esta comprobación vive aquí, dentro de la función, para cubrir también la carrera (23505 y relectura) y no depender del precheck de la aplicación. No se escribe nada ni se consume numeración (la excepción deshace todo).
    SELECT o.observacion INTO v_original FROM public.nce_observaciones_originales o WHERE o.empresa_id = p_empresa AND o.nce_id = v_id;
    IF NOT FOUND OR v_original IS DISTINCT FROM p_observacion_original THEN
      RAISE EXCEPTION 'la clave de idempotencia ya se usó con otro contenido' USING ERRCODE = 'P0001', DETAIL = 'NEX:IDEMPOTENCIA_CONFLICTO';
    END IF;
  END IF;

  RETURN QUERY SELECT v_id, v_numero, v_reutilizado;
END $$;

COMMENT ON FUNCTION public.fe_documento_crear_nce_obs(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb, text) IS 'NEX-071: crea la NCE con fe_documento_crear_nce y registra, en la misma transacción, la observación original del operador (solo si la NCE es nueva); si se reutiliza, exige que la observación original registrada sea exactamente la recibida (si no, conflicto de idempotencia).';

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_nce_observacion() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  -- La aplicación solo LEE la observación original; escribe únicamente a través de fe_documento_crear_nce_obs.
  REVOKE ALL ON public.nce_observaciones_originales FROM nexit_runtime;
  GRANT SELECT ON public.nce_observaciones_originales TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_nce_obs(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_documento_crear_nce_obs(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb, text) TO nexit_runtime;
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_nce_observacion() FROM PUBLIC;
SELECT public.nex_aplicar_grants_facturacion_nce_observacion();
