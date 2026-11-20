-- PRE-VERIFICACIÓN de NEX-070 (servicio DESCUENTO en la NCE, PRO-200 E07). SOLO LECTURA: no modifica nada. La ejecuta el responsable en la VM ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-070.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar. NEX-070 NO depende de NEX-066…069.
BEGIN READ ONLY;

\echo '== 1. Dependencias (todas deben dar ok = true) =='
SELECT 'NEX-065 aplicada (fe_documento_crear_nce de 11 parámetros)' AS control, to_regprocedure('public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)') IS NOT NULL AS ok
UNION ALL SELECT 'nce_origen y nce_lineas existen', to_regclass('public.nce_origen') IS NOT NULL AND to_regclass('public.nce_lineas') IS NOT NULL
UNION ALL SELECT 'disparador de solo altas (nce_solo_altas)', to_regprocedure('public.nce_solo_altas()') IS NOT NULL
UNION ALL SELECT 'secuencias por tipo (fe_secuencia_reservar)', to_regprocedure('public.fe_secuencia_reservar(uuid,uuid,text)') IS NOT NULL
UNION ALL SELECT 'rol nexit_runtime existe', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
UNION ALL SELECT 'NEX-070 ausente (no se reaplica)', to_regclass('public.nce_descuentos') IS NULL;

\echo '== 2. Estado de migraciones registrado =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-062', 'NEX-065', 'NEX-066', 'NEX-067', 'NEX-068', 'NEX-069', 'NEX-070') ORDER BY version;
SELECT count(*) AS total, max(version) AS ultima FROM public.schema_migrations;

\echo '== 3. Informativo: NCE existentes por motivo (no se modifica ninguna) =='
SELECT o.motivo, n.estado_sifen, count(*) AS notas FROM public.nce_origen o JOIN public.documentos_electronicos n ON n.empresa_id = o.empresa_id AND n.id = o.nce_id GROUP BY o.motivo, n.estado_sifen ORDER BY o.motivo, n.estado_sifen;

ROLLBACK;
