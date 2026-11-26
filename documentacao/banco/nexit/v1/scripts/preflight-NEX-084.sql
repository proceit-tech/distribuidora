-- PRE-VERIFICACIÓN de NEX-084 (PRO-312-R02 / Lote A: contrato SQL de envío E03 R05). SOLO LECTURA.
-- La ejecuta el responsable, con autorización expresa y en la ventana prevista, ANTES de aplicar NEX-084 con el runner oficial:
--   psql -X -v ON_ERROR_STOP=1 -v entorno=VM -f preflight-NEX-084.sql
-- entorno (R02-C01 F005): VM (por defecto, modo estricto del operador: el rol nexit_runtime DEBE existir) o CI (base efímera sin ese rol: su ausencia es intencional y se informa).
-- Transacción READ ONLY + ROLLBACK: no escribe nada. Nada de esto fue ejecutado por Claude (ni en la VM ni en otra base).
-- Sección 1: cualquier fila con ok = false significa NO APLICAR hasta conciliar. Secciones 2–4: informativas (conteos agregados; no muestra payloads, respuestas, CDC, lotes,
-- credenciales ni identificadores de empresa/documento).
-- Ejecutar con el rol propietario del esquema (el mismo del runner): nexit_runtime no tiene SELECT sobre todas las tablas consultadas.
-- Checksums esperados (SHA-256 de los archivos versionados de la rama): NEX-062 62ce6709…, NEX-072 e34de98d…, NEX-079 6a87a9a7…, NEX-080 00c1aaf2…, NEX-083 88de3731… (completos abajo).
\if :{?entorno}
\else
  \set entorno VM
\endif
BEGIN READ ONLY;

\echo '== 1. Dependencias y ausencia de objetos R05 (todas deben dar ok = true) =='
WITH sm AS (SELECT to_regclass('public.schema_migrations') IS NOT NULL AS existe)
SELECT orden, control, ok FROM (
  SELECT 1 AS orden, 'schema_migrations existe (NEX-001)' AS control, (SELECT existe FROM sm) AS ok
  UNION ALL SELECT 2, 'NEX-062 registrada con checksum 62ce6709d2bbd8362ea63d247761de8db26012f25aee4f6951cde6b641b54eb4',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-062' AND checksum = '62ce6709d2bbd8362ea63d247761de8db26012f25aee4f6951cde6b641b54eb4'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 3, 'NEX-072 registrada con checksum e34de98d3a6172e366548125a2d3548b43de85e0fb10d20c95e244f208e39b7f',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-072' AND checksum = 'e34de98d3a6172e366548125a2d3548b43de85e0fb10d20c95e244f208e39b7f'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 4, 'NEX-079 registrada con checksum 6a87a9a7e58a009b0815db89bb838b26efe000003b3d852ad6bf7c880491d77c',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-079' AND checksum = '6a87a9a7e58a009b0815db89bb838b26efe000003b3d852ad6bf7c880491d77c'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 5, 'NEX-080 registrada con checksum 00c1aaf2c746869384f0d22f2b4076191ce89bdfcfe5bc365f1f226e1b391274',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-080' AND checksum = '00c1aaf2c746869384f0d22f2b4076191ce89bdfcfe5bc365f1f226e1b391274'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 6, 'NEX-083 registrada con checksum 88de3731ef433c28ff348659831523ef9d1ca1960e29a2b94dd49642c3c4e1cc',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-083' AND checksum = '88de3731ef433c28ff348659831523ef9d1ca1960e29a2b94dd49642c3c4e1cc'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 7, 'NEX-084 NO registrada y ninguna versión NEX posterior registrada',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 0 AS ok FROM public.schema_migrations WHERE version ~ '^NEX-[0-9]{3}$' AND version >= 'NEX-084'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 10, 'tablas base de NEX-047/048/072 existen (documentos, solicitudes, intentos, evidencias) y empresas/usuarios',
    (SELECT count(*) = 6 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND c.relname IN ('empresas', 'usuarios', 'documentos_electronicos', 'documento_electronico_solicitudes', 'documento_electronico_intentos', 'documento_electronico_envio_evidencias'))
  UNION ALL SELECT 11, 'restricciones de destino de las FK compuestas: envio_evidencias_identidad_uk, documento_electronico_intentos_doc_id_uk, usuarios (empresa_id, id) única',
    to_regclass('public.documento_electronico_envio_evidencias') IS NOT NULL AND to_regclass('public.documento_electronico_intentos') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envio_evidencias_identidad_uk' AND conrelid = to_regclass('public.documento_electronico_envio_evidencias'))
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documento_electronico_intentos_doc_id_uk' AND conrelid = to_regclass('public.documento_electronico_intentos'))
    AND EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = to_regclass('public.usuarios') AND k.contype IN ('u', 'p')
                  AND k.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = k.conrelid AND attname = 'empresa_id'),
                                       (SELECT attnum FROM pg_attribute WHERE attrelid = k.conrelid AND attname = 'id')]::int2[])
  UNION ALL SELECT 12, 'columna documento_electronico_intentos.conexion (NEX-079) existe',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name = 'conexion')
  UNION ALL SELECT 13, 'funciones envueltas o reutilizadas existen con su firma exacta (NEX-012/014/046/052/062/072/079/080)',
    to_regprocedure('public.fe_documento_iniciar_envio(uuid,uuid,uuid,boolean)') IS NOT NULL
    AND to_regprocedure('public.fe_documento_registrar_envio_r05(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb)') IS NOT NULL
    AND to_regprocedure('public.fe_intento_conexion_segura(jsonb)') IS NOT NULL
    AND to_regprocedure('public.fe_e03_redactar_texto(text)') IS NOT NULL AND to_regprocedure('public.fe_e03_secreto_residual(text)') IS NOT NULL
    AND to_regprocedure('public.fe_e03_evidencia_inmutable()') IS NOT NULL
    AND to_regprocedure('public.fe_e03_iniciar_envio(uuid,uuid,uuid,boolean)') IS NOT NULL
    AND to_regprocedure('public.fe_e03_registrar_evento(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text)') IS NOT NULL
    AND to_regprocedure('public.fe_e03_cerrar_envio(uuid,uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,jsonb)') IS NOT NULL
    AND to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NOT NULL AND to_regprocedure('public.sucursal_en_alcance(uuid,uuid,uuid)') IS NOT NULL
    AND to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NOT NULL AND to_regprocedure('public.nex_aplicar_grants_runtime()') IS NOT NULL
    AND to_regprocedure('public.nex_aplicar_grants_facturacion_e03()') IS NOT NULL
  UNION ALL SELECT 14, 'gen_random_uuid() y sha256(bytea) disponibles (PostgreSQL >= 13)',
    to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL AND to_regprocedure('pg_catalog.sha256(bytea)') IS NOT NULL
  UNION ALL SELECT 15, 'base en UTF8 (los bytes y SHA-256 del cuerpo HTTP se calculan sobre convert_to(texto, ''UTF8''))',
    (SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database()) = 'UTF8'
  UNION ALL SELECT 16, 'entorno declarado: ' || :'entorno' || ' (valores admitidos VM o CI)', :'entorno' IN ('VM', 'CI')
  UNION ALL SELECT 17, 'rol nexit_runtime: obligatorio en VM; su ausencia solo se admite con -v entorno=CI',
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR :'entorno' = 'CI'
  UNION ALL SELECT 20, 'ningún objeto R05 previo (tablas, funciones, ayudante ni disparadores de NEX-084)',
    to_regclass('public.nex_e03_r05_estado') IS NULL AND to_regclass('public.documento_electronico_envio_operaciones_r05') IS NULL
    AND to_regclass('public.documento_electronico_envio_posts_grandes_r05') IS NULL AND to_regclass('public.documento_electronico_envio_autenticaciones_r05') IS NULL
    AND to_regclass('public.documento_electronico_envio_proyecciones_r05') IS NULL AND to_regclass('public.documento_electronico_envio_cierres_r05') IS NULL
    AND to_regclass('public.documento_electronico_envio_salidas_tardias_r05') IS NULL
    AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'fe\_e03\_%\_r05' OR p.proname LIKE 'fe\_e03\_r05\_%'
                                                                                             OR p.proname IN ('nex_e03_r05_estado_guarda', 'nex_aplicar_grants_facturacion_e03_r05')))
    AND NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgname = 'envio_evidencias_r05_guarda_trg')
  UNION ALL SELECT 21, 'rol actual dueño (o miembro del rol dueño) de documento_electronico_envio_evidencias (CREATE TRIGGER lo exige)',
    EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = to_regclass('public.documento_electronico_envio_evidencias') AND pg_has_role(current_user, c.relowner, 'USAGE'))
) x ORDER BY orden;

\echo '== 2. Ventana de aplicación (informativo; lo esperado es 0 documentos en envío y 0 operaciones recientes) =='
-- Mismos criterios que verificar y reversión (R02-C01 F005): operación abierta = sin cierre; última actividad = el mayor creado_at de la raíz y de sus eventos; reciente = última
-- actividad >= corte − 10 minutos; UN corte por ejecución (now() es fijo dentro de esta transacción). Antes de NEX-084 solo existen operaciones NEX-072 (raíz INICIO + eventos).
-- El UMBRAL DE ACTIVIDAD (10 min) no es la VENTANA DE DRENAJE (15 min, procedimiento del operador: desactivar el envío en todas las instancias y esperar o reiniciar).
SELECT 'documentos en ENVIANDO (NEX-084 toma un bloqueo de fila del documento en cada escritura R05; aplicar sin envíos en curso)' AS control,
       count(*) FILTER (WHERE estado_local = 'ENVIANDO') AS cantidad,
       count(*) FILTER (WHERE estado_local = 'ENVIO_INDETERMINADO') AS indeterminados_previos
  FROM public.documentos_electronicos;
WITH corte AS (SELECT now() AS t),
abiertas AS (
  SELECT (SELECT max(e.creado_at) FROM public.documento_electronico_envio_evidencias e
           WHERE e.empresa_id = i.empresa_id AND e.documento_id = i.documento_id AND e.operacion_id = i.id) AS ultima
    FROM public.documento_electronico_envio_evidencias i
   WHERE i.tipo_evento = 'INICIO'
     AND NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias c WHERE c.empresa_id = i.empresa_id AND c.documento_id = i.documento_id AND c.operacion_id = i.id AND c.tipo_evento = 'CIERRE'))
SELECT 'operaciones NEX-072 abiertas (sin CIERRE) por última actividad' AS control, (SELECT t FROM corte) AS corte, count(*) AS abiertas,
       count(*) FILTER (WHERE ultima >= (SELECT t FROM corte) - interval '10 minutes') AS recientes_10_min,
       count(*) FILTER (WHERE ultima < (SELECT t FROM corte) - interval '10 minutes') AS antiguas
  FROM abiertas;

\echo '== 3. Evidencia NEX-072 existente (informativo: NEX-084 no la modifica ni la completa; no hay backfill) =='
SELECT tipo_evento, count(*) AS filas FROM public.documento_electronico_envio_evidencias GROUP BY tipo_evento ORDER BY tipo_evento;
-- Las operaciones NEX-072 abiertas (§2) quedan como están: NEX-084 no las adopta como R05 ni les inventa cierre.
SELECT 'privilegio EXECUTE de nexit_runtime sobre las 3 funciones de escritura de NEX-072 (NEX-084 lo RETIRA: la aplicación vigente no las usa)' AS control,
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN 'sin rol nexit_runtime'
            ELSE (SELECT string_agg(p::text || ' = ' || has_function_privilege('nexit_runtime', p, 'EXECUTE'), '; ')
                    FROM unnest(ARRAY['public.fe_e03_iniciar_envio(uuid,uuid,uuid,boolean)'::regprocedure,
                                      'public.fe_e03_registrar_evento(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text)'::regprocedure,
                                      'public.fe_e03_cerrar_envio(uuid,uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,jsonb)'::regprocedure]) p) END AS estado;

\echo '== 4. Dimensión de los snapshots FE/NCE (D8-B, D6-c; conteo agregado autorizado, sin contenido; NO es una medición de compatibilidad) =='
-- payload::text es la serialización canónica de jsonb, NO el texto exacto que transmite la aplicación (JSON.stringify): solo orden de magnitud. NEX-084 aplica sus límites sobre el texto
-- HTTP exacto de cada POST (<= 1 MiB en NEX-072, > 1 MiB en la tabla de POST grandes, > 8 MiB rechazado sin transmitir).
-- R02-C01 F004: 8 MiB es un límite PROVISIONAL. pg_column_size (almacenamiento jsonb, TOAST/compresión) NO acota el texto serializado. Bloqueos del Lote B (gate B), no resueltos aquí:
-- compatibilidad con facturas válidas de 999 ítems no demostrada; tamaño canónico jsonb ≠ serialización JavaScript; precisión numérica del snapshot histórico (D6-c) pendiente.
SELECT count(*) AS solicitudes,
       max(octet_length(convert_to(payload::text, 'UTF8'))) AS max_bytes_texto_canonico,
       count(*) FILTER (WHERE octet_length(convert_to(payload::text, 'UTF8')) > 1048576) AS mayores_1_mib,
       count(*) FILTER (WHERE octet_length(convert_to(payload::text, 'UTF8')) > 8388608) AS mayores_8_mib,
       max(pg_column_size(payload)) AS max_pg_column_size
  FROM public.documento_electronico_solicitudes;

ROLLBACK;
