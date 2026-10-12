-- REVERSIÓN manual de NEX-047 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-047.sql
-- ABORTA si existe algún documento electrónico o intento (son registros fiscales: expórtelos antes) o si algún perfil tiene asignado un permiso
-- FACTURACION_ELECTRONICA.* (se perdería esa configuración sin aviso). La configuración del gateway (fe_gateway_config, sin secretos) se elimina.
-- Después hay que borrar la fila 'NEX-047' de schema_migrations.
DO $$
BEGIN
  IF to_regclass('public.documentos_electronicos') IS NULL THEN
    RAISE EXCEPTION 'documentos_electronicos no existe: NEX-047 no está aplicada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documentos_electronicos) OR EXISTS (SELECT 1 FROM public.documento_electronico_intentos) THEN
    RAISE EXCEPTION 'hay documentos electrónicos o intentos registrados: exporte la evidencia fiscal antes de revertir (no se pierde en silencio).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.perfil_permiso pp JOIN public.permisos pe ON pe.id = pp.permiso_id WHERE pe.recurso = 'FACTURACION_ELECTRONICA') THEN
    RAISE EXCEPTION 'hay perfiles con permisos FACTURACION_ELECTRONICA.* asignados: retírelos desde la administración de perfiles antes de revertir.';
  END IF;
END $$;

-- Restaura el envoltorio de grants de NEX-046 (base + proveedores + fiscal + productos + comercial + depósitos) y retira el de facturación.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
  PERFORM public.nex_aplicar_grants_fiscal();
  PERFORM public.nex_aplicar_grants_productos();
  PERFORM public.nex_aplicar_grants_comercial();
  PERFORM public.nex_aplicar_grants_depositos();
END $$;
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion();

DROP FUNCTION IF EXISTS public.fe_documento_registrar_consulta(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb);
DROP TRIGGER IF EXISTS documento_electronico_intentos_inmutable_truncate_trg ON public.documento_electronico_intentos;
DROP TRIGGER IF EXISTS documento_electronico_intentos_inmutable_fila_trg ON public.documento_electronico_intentos;
DROP TRIGGER IF EXISTS documentos_electronicos_inmutable_truncate_trg ON public.documentos_electronicos;
DROP TRIGGER IF EXISTS documentos_electronicos_inmutable_fila_trg ON public.documentos_electronicos;
DROP TABLE IF EXISTS public.documento_electronico_intentos;
DROP TABLE IF EXISTS public.documentos_electronicos;
DROP TABLE IF EXISTS public.fe_gateway_config;
DROP FUNCTION IF EXISTS public.fe_documentos_inmutable();
DROP FUNCTION IF EXISTS public.fe_cdc_coherente(text, text, text, text, text);
DELETE FROM public.permisos WHERE recurso = 'FACTURACION_ELECTRONICA';
