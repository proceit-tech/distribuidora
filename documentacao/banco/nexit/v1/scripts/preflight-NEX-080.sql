-- PRE-VERIFICACIÓN de NEX-080 (PRO-342-R05: CDC como dato opaco informado por la API). SOLO LECTURA. La ejecuta el responsable ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-080.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar. No escribe nada (transacción READ ONLY + ROLLBACK). No presupone la versión de la VM: la comprueba.
BEGIN READ ONLY;

\echo '== 1. Dependencias y estado (todas deben dar ok = true) =='
SELECT 'NEX-079: núcleo de consulta con conexión' AS control,
       to_regprocedure('public.fe_documento_registrar_consulta_nucleo(text,uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,uuid,jsonb)') IS NOT NULL AS ok
UNION ALL SELECT 'NEX-079: registro de envío con conexión', to_regprocedure('public.fe_documento_registrar_envio(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,jsonb,jsonb)') IS NOT NULL
UNION ALL SELECT 'NEX-079: documento_electronico_intentos.conexion', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name = 'conexion')
UNION ALL SELECT 'NEX-077: documentos_electronicos.consulta_lease_token', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documentos_electronicos' AND column_name = 'consulta_lease_token')
UNION ALL SELECT 'NEX-062/070: fe_documento_crear_nce y nce_descuentos', to_regprocedure('public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)') IS NOT NULL AND to_regclass('public.nce_descuentos') IS NOT NULL
UNION ALL SELECT 'NEX-047: trigger fe_documentos_inmutable', to_regprocedure('public.fe_documentos_inmutable()') IS NOT NULL
UNION ALL SELECT 'NEX-047: índice único documentos_electronicos_cdc_key (se conserva)', to_regclass('public.documentos_electronicos_cdc_key') IS NOT NULL
UNION ALL SELECT 'restricciones CDC de documentos = 2 (formato + coherencia)', (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.documentos_electronicos'::regclass AND contype = 'c'
       AND (pg_get_constraintdef(oid) LIKE '%fe_cdc_coherente(%' OR pg_get_constraintdef(oid) LIKE '%(cdc ~ %')) = 2
UNION ALL SELECT 'restricción CDC de intentos = 1', (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.documento_electronico_intentos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%(cdc_informado ~ %') = 1
UNION ALL SELECT 'restricción CDC de nce_origen = 1', (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.nce_origen'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%(fe_cdc ~ %') = 1
UNION ALL SELECT 'NEX-080 ausente (no se reaplica)', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name = 'cdc_proyeccion')
       AND to_regclass('public.nex080_respaldo') IS NULL AND to_regprocedure('public.fe_documento_registrar_envio_r05(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb)') IS NULL;

\echo '== 2. Datos actuales (solo conteos, sin valores; NEX-080 NO modifica ningún CDC, estado ni intento existente) =='
SELECT count(*) FILTER (WHERE cdc IS NOT NULL) AS documentos_con_cdc, count(*) FILTER (WHERE cdc IS NULL) AS documentos_sin_cdc,
       count(*) FILTER (WHERE ultima_consulta_resultado = 'CDC_DIVERGENTE') AS documentos_ultima_consulta_cdc_divergente
  FROM public.documentos_electronicos;
SELECT count(*) FILTER (WHERE resultado = 'CDC_DIVERGENTE') AS intentos_cdc_divergente_historicos, count(*) FILTER (WHERE cdc_informado IS NOT NULL) AS intentos_con_cdc_informado
  FROM public.documento_electronico_intentos;

\echo '== 3. Estado de migraciones registrado =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-077', 'NEX-078', 'NEX-079', 'NEX-080') ORDER BY version;

ROLLBACK;
