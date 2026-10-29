-- =====================================================================
-- NEX-028 — Documentos de Clientes: archivos reales en almacenamiento privado (CLI-VIS-01; decisión del responsable 2026-10-11).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Reversión: scripts/reversion-NEX-028.sql. No modifica filas existentes.
--
-- Hasta ahora cliente_documentos guardaba solo una URL externa (url_archivo NOT NULL). Ahora el archivo se almacena en el
-- volumen privado de la VM (lib/almacenamiento/archivos-privados.ts) y la base guarda SOLO metadatos y una CLAVE INTERNA
-- relativa (almacen_clave = <empresa_id>/clientes/<cliente_id>/<archivo_id>), nunca una URL pública ni una ruta absoluta.
-- Los documentos anteriores (con url_archivo) se conservan intactos y siguen visibles; los nuevos usan almacen_clave.
-- =====================================================================

ALTER TABLE public.cliente_documentos
  ALTER COLUMN url_archivo DROP NOT NULL,
  ADD COLUMN almacen_clave varchar(120),
  ADD COLUMN tamano_bytes  bigint,
  ADD COLUMN tipo_mime     varchar(100),
  ADD COLUMN sha256        char(64);

ALTER TABLE public.cliente_documentos
  ADD CONSTRAINT cliente_documentos_origen_chk CHECK (url_archivo IS NOT NULL OR almacen_clave IS NOT NULL),
  ADD CONSTRAINT cliente_documentos_almacen_chk CHECK (
    almacen_clave IS NULL OR (
      almacen_clave ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/clientes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND tamano_bytes IS NOT NULL AND tamano_bytes > 0 AND tamano_bytes <= 10485760
      AND tipo_mime IS NOT NULL AND sha256 ~ '^[0-9a-f]{64}$')),
  ADD CONSTRAINT cliente_documentos_almacen_clave_key UNIQUE (almacen_clave);

COMMENT ON COLUMN public.cliente_documentos.almacen_clave IS 'Clave interna del archivo en el almacenamiento privado (relativa a NEXIT_ARCHIVOS_DIR). No es una URL.';
COMMENT ON COLUMN public.cliente_documentos.url_archivo   IS 'Solo documentos anteriores a NEX-028 (enlace externo). Los documentos nuevos usan almacen_clave.';
