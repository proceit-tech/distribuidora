-- REVERSIÓN manual de NEX-049 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-049.sql
-- ABORTA si existen intentos de ENVÍO o documentos en estado ENVIANDO / con lote (se perdería evidencia de transmisión). Después hay que borrar la fila
-- 'NEX-049' de schema_migrations.
DO $$
BEGIN
  IF to_regprocedure('public.fe_documento_iniciar_envio(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'fe_documento_iniciar_envio no existe: NEX-049 no está aplicada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_intentos WHERE tipo = 'ENVIO')
     OR EXISTS (SELECT 1 FROM public.documentos_electronicos WHERE estado_local = 'ENVIANDO' OR lote IS NOT NULL OR envio_iniciado_at IS NOT NULL) THEN
    RAISE EXCEPTION 'hay envíos registrados: exporte la evidencia de transmisión antes de revertir (no se pierde en silencio).';
  END IF;
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
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion_envio();
DROP FUNCTION IF EXISTS public.fe_documento_registrar_envio(uuid, uuid, uuid, text, text, text, integer, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.fe_documento_iniciar_envio(uuid, uuid, uuid);
ALTER TABLE public.documento_electronico_intentos DROP COLUMN IF EXISTS fase, DROP COLUMN IF EXISTS lote;
ALTER TABLE public.documentos_electronicos DROP CONSTRAINT IF EXISTS documentos_electronicos_estado_local_check;
ALTER TABLE public.documentos_electronicos
  ADD CONSTRAINT documentos_electronicos_estado_local_check CHECK (estado_local IN ('PENDIENTE_ENVIO','ENVIO_INDETERMINADO','ENVIADO','ERROR_ENVIO'));
ALTER TABLE public.documentos_electronicos DROP COLUMN IF EXISTS lote, DROP COLUMN IF EXISTS envio_iniciado_at;
