-- REVERSIÓN manual de NEX-041 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-041.sql
-- ABORTA si existe cualquier archivo, versión, foto privada o evento de auditoría de Productos (se perdería su trazabilidad / el vínculo con
-- el almacenamiento). Los documentos con enlace anterior no se ven afectados. Después hay que borrar la fila 'NEX-041' de schema_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.producto_documentos WHERE almacen_clave IS NOT NULL OR eliminado_at IS NOT NULL OR url_archivo IS NULL) THEN
    RAISE EXCEPTION 'Hay documentos de producto con archivo, eliminados o sin enlace: expórtelos antes (no se pierden en silencio).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.producto_documento_versiones) THEN
    RAISE EXCEPTION 'producto_documento_versiones tiene filas: consérvelas antes de revertir.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.productos WHERE imagen_clave IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay fotos privadas de producto: expórtelas antes de revertir.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.producto_eventos) THEN
    RAISE EXCEPTION 'producto_eventos tiene filas (auditoría): consérvela antes de revertir.';
  END IF;
END $$;

-- Restaura el envoltorio de grants de NEX-039 (base + proveedores + fiscal) y retira la función de permisos de Productos.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
  PERFORM public.nex_aplicar_grants_fiscal();
END $$;
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_productos();

DROP TRIGGER IF EXISTS producto_eventos_inmutable_truncate_trg ON public.producto_eventos;
DROP TRIGGER IF EXISTS producto_eventos_inmutable_fila_trg ON public.producto_eventos;
DROP FUNCTION IF EXISTS public.producto_eventos_inmutable();
DROP TABLE IF EXISTS public.producto_eventos;

DROP INDEX IF EXISTS public.productos_imagen_clave_uq;
ALTER TABLE public.productos
  DROP CONSTRAINT IF EXISTS productos_imagen_chk,
  DROP CONSTRAINT IF EXISTS productos_imagen_actualizada_por_fk,
  DROP COLUMN IF EXISTS imagen_actualizada_por,
  DROP COLUMN IF EXISTS imagen_actualizada_at,
  DROP COLUMN IF EXISTS imagen_sha256,
  DROP COLUMN IF EXISTS imagen_tamano,
  DROP COLUMN IF EXISTS imagen_mime,
  DROP COLUMN IF EXISTS imagen_nombre,
  DROP COLUMN IF EXISTS imagen_clave,
  DROP COLUMN IF EXISTS carga_documentos_inicial_abierta;

DROP TABLE IF EXISTS public.producto_documento_versiones;
DROP INDEX IF EXISTS public.producto_documentos_activos_idx;
DROP INDEX IF EXISTS public.producto_documentos_clave_uq;
ALTER TABLE public.producto_documentos
  DROP CONSTRAINT IF EXISTS producto_documentos_archivo_chk,
  DROP CONSTRAINT IF EXISTS producto_documentos_fuente_chk,
  DROP CONSTRAINT IF EXISTS producto_documentos_eliminado_chk,
  DROP CONSTRAINT IF EXISTS producto_documentos_eliminado_por_fk,
  DROP COLUMN IF EXISTS eliminado_por,
  DROP COLUMN IF EXISTS eliminado_at,
  DROP COLUMN IF EXISTS version_vigente,
  DROP COLUMN IF EXISTS sha256,
  DROP COLUMN IF EXISTS tipo_mime,
  DROP COLUMN IF EXISTS tamano_bytes,
  DROP COLUMN IF EXISTS almacen_clave;
ALTER TABLE public.producto_documentos ALTER COLUMN url_archivo SET NOT NULL;

-- El rol de la aplicación recupera el DELETE sobre documentos de la reaplicación base de grants (NEX-013…020).
SELECT public.nex_aplicar_grants_runtime();
