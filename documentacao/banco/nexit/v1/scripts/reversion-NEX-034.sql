-- REVERSIÓN manual de NEX-034 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-034.sql
-- ABORTA si hay auditoría registrada, bloqueos con autor o permisos asignados a perfiles: son trazabilidad que no debe perderse.
DO $$
BEGIN
  IF to_regclass('public.proveedor_eventos') IS NOT NULL AND EXISTS (SELECT 1 FROM public.proveedor_eventos) THEN
    RAISE EXCEPTION 'proveedor_eventos contiene auditoría: expórtela antes de revertir NEX-034.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.proveedores WHERE bloqueado_por IS NOT NULL OR bloqueado_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay bloqueos con autor/fecha registrados: no se revierte NEX-034 para no perder esa trazabilidad.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.perfil_permiso pp JOIN public.permisos pe ON pe.id = pp.permiso_id
              WHERE pe.codigo IN ('PROVEEDORES.HOMOLOGAR','PROVEEDORES.EVALUAR_RIESGO','PROVEEDORES.BLOQUEAR','PROVEEDORES.APROBAR_BANCO')) THEN
    RAISE EXCEPTION 'Hay perfiles con los permisos de gobernanza de Proveedores: retírelos explícitamente antes de revertir NEX-034.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.proveedor_elegible_para_compra(uuid, uuid);
ALTER TABLE public.proveedores
  DROP CONSTRAINT IF EXISTS proveedores_motivo_bloqueo_largo_chk,
  DROP CONSTRAINT IF EXISTS proveedores_motivo_bloqueo_chk,
  DROP CONSTRAINT IF EXISTS proveedores_bloqueado_por_fk,
  DROP COLUMN IF EXISTS bloqueado_at,
  DROP COLUMN IF EXISTS bloqueado_por;
DROP TABLE IF EXISTS public.proveedor_eventos;
DELETE FROM public.permisos WHERE codigo IN ('PROVEEDORES.HOMOLOGAR','PROVEEDORES.EVALUAR_RIESGO','PROVEEDORES.BLOQUEAR','PROVEEDORES.APROBAR_BANCO');
