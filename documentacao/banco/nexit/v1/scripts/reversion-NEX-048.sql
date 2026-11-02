-- REVERSIÓN manual de NEX-048 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-048.sql
-- ABORTA si existen solicitudes de emisión (son la fuente del payload de documentos creados), puntos de expedición con numeración usada o perfiles con
-- FACTURACION_ELECTRONICA.CREAR asignado. Después hay que borrar la fila 'NEX-048' de schema_migrations.
DO $$
BEGIN
  IF to_regclass('public.documento_electronico_solicitudes') IS NULL THEN
    RAISE EXCEPTION 'documento_electronico_solicitudes no existe: NEX-048 no está aplicada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_solicitudes) THEN
    RAISE EXCEPTION 'hay solicitudes de emisión registradas: exporte la evidencia antes de revertir (no se pierde en silencio).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_puntos_expedicion WHERE ultimo_numero > 0) THEN
    RAISE EXCEPTION 'hay puntos de expedición con numeración registrada: anote el último número de cada uno antes de revertir.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.perfil_permiso pp JOIN public.permisos pe ON pe.id = pp.permiso_id WHERE pe.codigo = 'FACTURACION_ELECTRONICA.CREAR') THEN
    RAISE EXCEPTION 'hay perfiles con FACTURACION_ELECTRONICA.CREAR asignado: retírelo desde la administración de perfiles antes de revertir.';
  END IF;
END $$;

-- Restaura el envoltorio de grants de NEX-047.
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
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion_emision();
DROP FUNCTION IF EXISTS public.fe_documento_crear_fe(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb);
DROP TRIGGER IF EXISTS documento_electronico_solicitudes_truncate_trg ON public.documento_electronico_solicitudes;
DROP TRIGGER IF EXISTS documento_electronico_solicitudes_inmutable_trg ON public.documento_electronico_solicitudes;
DROP TRIGGER IF EXISTS fe_puntos_expedicion_truncate_trg ON public.fe_puntos_expedicion;
DROP TRIGGER IF EXISTS fe_puntos_expedicion_inmutable_trg ON public.fe_puntos_expedicion;
DROP TABLE IF EXISTS public.documento_electronico_solicitudes;
DROP TABLE IF EXISTS public.fe_puntos_expedicion;
DROP FUNCTION IF EXISTS public.fe_emision_inmutable();
DELETE FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.CREAR';
