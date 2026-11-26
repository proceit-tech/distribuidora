-- PRE-VERIFICACIÓN de NEX-073 (fecha de emisión elegida, PRO-93 / PRO-294). SOLO LECTURA. La ejecuta el responsable en la VM ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-073.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar.
BEGIN READ ONLY;

\echo '== 1. Dependencias (todas deben dar ok = true) =='
SELECT 'fe_documento_crear_fe de 11 parámetros (NEX-065)' AS control, to_regprocedure('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)') IS NOT NULL AS ok
UNION ALL SELECT 'fe_secuencia_reservar (NEX-063)', to_regprocedure('public.fe_secuencia_reservar(uuid,uuid,text)') IS NOT NULL
UNION ALL SELECT 'NEX-073 ausente (no se reaplica)', to_regprocedure('public.fe_emision_fecha_soportada()') IS NULL;

\echo '== 2. Estado de migraciones registrado =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-065', 'NEX-067', 'NEX-068', 'NEX-073') ORDER BY version;

ROLLBACK;
