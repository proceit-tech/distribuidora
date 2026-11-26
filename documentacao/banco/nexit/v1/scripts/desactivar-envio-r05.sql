-- DESACTIVACIÓN COORDINADA DEL ENVÍO R05 (PRO-312-R02-C04, corrección C04-C01; resuelve R-VM-085-01). Script de OPERADOR, NO es una migración: vive fuera de migraciones/,
-- el runner (aplicar-migraciones.sh solo recorre migraciones/NEX-0*.sql) no lo descubre ni lo ejecuta, y no se registra en schema_migrations. Nada de esto fue ejecutado por Claude.
--
-- Qué es: el cambio de COMPORTAMIENTO del modo global R05 ACTIVO → REVERTIDO con NEX-084 y NEX-085 instaladas, en la combinación exacta revisada (inventario de abajo).
-- Qué NO es: no es una reversión de esquema ni de la corrección de seguridad NEX-085 (reversion-NEX-085.sql sigue abortando siempre); no sustituye ni contorna
-- reversion-NEX-084.sql, que sigue intacto y válido solo en su combinación histórica (NEX-084 sin migraciones posteriores) y que con NEX-085 instalada aborta en su P1:
-- NO usarlo con NEX-085 instalada. No reactiva: volver a ACTIVO exige una orden futura separada (no hay script de reactivación).
--
-- CONTRATO DE INVOCACIÓN (solo con autorización expresa del responsable, en ventana exclusiva de mantenimiento; ver
-- documentacao/infra/PROCEDIMENTO-DESACTIVACION-COORDINADA-R05-2026-11-25.md §6, que da el bloque de shell completo con las variables validadas):
--   psql -X -v ON_ERROR_STOP=1 -1 -v backup_verificado="$BACKUP" -v instrumentacion_desactivada="$INSTR" -v drenaje_confirmado="$DRENAJE" -v huerfanas="$HUERFANAS" -f -
--   con este archivo por la entrada estándar. Los valores los escribe el responsable DESPUÉS de comprobar cada condición; nunca se prellenan.
-- Modelo transaccional ÚNICO: psql -1 con -f (-1 solo se aplica a -c/-f; -f - lee la entrada estándar). Este archivo NO contiene BEGIN/COMMIT. Guardas:
--   · sin ON_ERROR_STOP=1: el script lo activa y fuerza un error ANTES de cualquier bloqueo o escritura → psql termina con código distinto de 0 (3) y la transacción no se confirma;
--   · sin -1 o sin -f (p. ej. `psql -1 < archivo`): la marca de transacción fijada en una sentencia anterior no sobrevive → aborta antes de bloquear (no depende de un
--     lock_timeout que la sesión pudiera traer configurado);
--   · aislamiento: la PRIMERA sentencia SQL fija READ COMMITTED (SET TRANSACTION) y el bloque lo comprueba antes de tocar catálogo o datos: cada sentencia posterior al
--     bloqueo toma una instantánea nueva y ve la actividad R05 confirmada mientras se esperaba la fila de modo (no se usa la configuración por defecto del servidor).
-- No se afirma seguridad frente a un operador que altere el archivo, el comando o la sesión fuera de este contrato.
--
-- Confirmaciones del operador (las mismas del procedimiento original; SQL NO puede verificar procesos remotos: son declaraciones explícitas del responsable y por sí solas no
-- garantizan la ausencia de procesos vivos):
--   backup_verificado=SI           hay un backup reciente de la base y se comprobó que restaura (exigido para ESTA operación, no para tareas normales).
--   instrumentacion_desactivada=SI el envío R05 está desactivado en TODAS las instancias de la aplicación (ninguna inicia ni registra envíos R05).
--   drenaje_confirmado=SI          tras desactivarlo se esperó la VENTANA DE DRENAJE de 15 minutos o se reiniciaron todas las instancias.
--   huerfanas=N                    número EXACTO (entero no negativo, solo dígitos) de operaciones R05 abiertas ANTIGUAS que el responsable reconoce (0 si no hay).
-- Dos umbrales distintos: VENTANA DE DRENAJE (15 min, procedimiento del operador, antes de ejecutar) ≠ UMBRAL DE ACTIVIDAD (10 min, comprobado aquí por SQL bajo el bloqueo con
-- la definición única fe_e03_r05_abiertas(timestamptz) de NEX-084).
--
-- Orden (todo en la MISMA transacción; cualquier error o desvío aborta y la transacción no se confirma):
--   1) SET TRANSACTION ISOLATION LEVEL READ COMMITTED (primera sentencia SQL) y lock_timeout local 5s;
--   2) comprobaciones de transacción única, aislamiento efectivo y confirmaciones del operador (sin bloqueos ni lecturas de datos);
--   3) pg_advisory_xact_lock(7340001): el mismo bloqueo consultivo que el runner toma en la transacción de CADA migración;
--   4) bajo ese bloqueo: inventario EXACTO NEX-001…NEX-085 (una vez cada una, sin NEX-000, sin duplicados, sin formatos no canónicos), checksums NEX-084/085, ninguna sucesora
--      no revisada; catálogo (firmas, retornos, dueño, ayudante corregido, tablas, disparadores);
--   5) fila de coordinación nex_e03_r05_estado FOR UPDATE (mismo recurso y orden que las escrituras R05, que la toman FOR SHARE antes del documento) y ACL PREVIA completa
--      según el modo inicial leído bajo ese bloqueo;
--   6) línea base de filas de evidencia (R05 y NEX-072 por separado) capturada YA bajo el bloqueo;
--   7) UN corte clock_timestamp(); 8) conteo con public.fe_e03_r05_abiertas(corte) (no se redefine ni se duplica); 9) recientes > 0 o antiguas ≠ huerfanas → aborta;
--  10) si ACTIVO: UPDATE de modo, cambiado_at y motivo de esa única fila; si ya REVERTIDO: no se toca la fila (idempotente);
--  11) reaplicación SOLO del ayudante corregido public.nex_aplicar_grants_facturacion_e03_r05() (no se redefine; no se llama al wrapper general ni a la base);
--  12) postcondiciones completas (ACL 3/7/32/42 + grant option + SELECT por columnas exacto + DML de tabla y por columna, disparadores, registros, conteos);
--  13) informe; 14) el COMMIT lo hace psql -1 al terminar el archivo.
-- RESULTADO (tres casos distintos; ni el informe ni el código de salida por sí solos prueban el estado del servidor):
--   A) aborto confirmado antes del commit: error del script dentro de la transacción, mensaje `desactivar-envio-r05: …`, código distinto de 0, sesión conservada → no hubo
--      commit. Si además la conexión se perdió, tratar como C.
--   B) commit confirmado: código 0 y COMMIT reconocido; aun así exigir la verificación posterior independiente (verificar-NEX-084.sql 41/41 y verificar-NEX-085.sql 24/24 con
--      -v entorno=VM, modo REVERTIDO).
--   C) resultado DESCONOCIDO: conexión perdida, ACK del COMMIT perdido, salida truncada o ambigua. El servidor pudo haber confirmado. NO repetir; consultar modo, privilegios
--      efectivos y evidencia en modo solo lectura (verificadores solo en una operación futura autorizada), diagnosticar y pedir decisión. Nunca GRANT/REVOKE como recuperación.
-- No accede a documentos fiscales ni los modifica (ni estados, ni CDC/lote, ni stock, FE/NCE, consulta, KuDE); no borra ni cierra operaciones, evidencias, proyecciones, cierres,
-- autenticaciones, POST grandes ni salidas tardías; no toca schema_migrations ni la política general de privilegios. Las operaciones huérfanas quedan abiertas en la evidencia;
-- el documento sigue la regla vigente de NEX-062 y la recuperación D4/D5 / D-C02-2-A (conciliación por consulta en la misma cuenta, nunca un POST ciego).
--
-- Límites (no se afirma más): el bloqueo 7340001 solo coordina con quien lo toma; el runner lo toma por migración pero su reaplicación FINAL del wrapper
-- (nex_aplicar_grants_runtime(), fuera de ese bloqueo) no queda cubierta: por eso se exige ventana EXCLUSIVA (sin runner, reaplicación de grants, DDL, reinicio DEMO, reactivación
-- ni otro cambio de modo simultáneos). Nada protege frente a superusuarios, procesos externos o SQL directo que no respeten este protocolo. Las comparaciones de antes/después son
-- de CANTIDADES (no prueban igualdad de contenido) y los controles del ayudante por subcadena no equivalen a un hash de su cuerpo ni defienden de DDL arbitrario. Un proceso que
-- conserve su testigo y escriba después recibe NEX:E03_R05_REVERTIDO (la guarda de modo se comprueba bajo FOR SHARE); su salida, si existió, solo se concilia por consulta.
--
-- INVENTARIO DE COMPATIBILIDAD (versionado en este archivo; cerrado por defecto). Revisión C04-C01 (25/11/2026):
--   obligatorias: NEX-001…NEX-085, cada una exactamente una vez; NEX-084 38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854 ·
--                 NEX-085 34f57411cef8f17c01f249b6e21e1904c8aa7aecd83718965bcfbadd4b29c7d7
--   sucesoras revisadas (> NEX-085): NINGUNA.
-- Cualquier registro NEX-000, duplicado, fuera del formato canónico NEX-NNN o posterior a NEX-085 no revisado aborta ANTES de escribir. Incorporar una sucesora exige revisar su
-- compatibilidad (modo, bloqueos, funciones, ACL, recuperación y semántica) y publicar una NUEVA revisión auditada de este script con su versión y checksum exactos en la
-- lista suc_revisadas de abajo. No hay comodines, rangos, parámetros de bypass ni listas aportadas por el operador.
\if :ON_ERROR_STOP
\else
  \echo 'desactivar-envio-r05: falta -v ON_ERROR_STOP=1. Se activa ON_ERROR_STOP y se fuerza un error ANTES de bloquear o escribir: psql termina con código distinto de 0 y sin commit.'
  \set ON_ERROR_STOP on
  SELECT 1 / 0 AS desactivar_envio_r05_requiere_on_error_stop;
\endif
\if :{?backup_verificado}
\else
  \set backup_verificado ''
\endif
\if :{?instrumentacion_desactivada}
\else
  \set instrumentacion_desactivada ''
\endif
\if :{?drenaje_confirmado}
\else
  \set drenaje_confirmado ''
\endif
\if :{?huerfanas}
\else
  \set huerfanas ''
\endif
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '5s';
SELECT set_config('nexit.desactivar_r05_tx', pg_backend_pid()::text || '@' || transaction_timestamp()::text, true) IS NOT NULL AS marca_transaccion,
       set_config('nexit.desactivar_r05_huerfanas', :'huerfanas', true) IS NOT NULL AS huerfanas_leido,
       set_config('nexit.desactivar_r05_backup', :'backup_verificado', true) IS NOT NULL AS backup_leido,
       set_config('nexit.desactivar_r05_instrumentacion', :'instrumentacion_desactivada', true) IS NOT NULL AS instrumentacion_leido,
       set_config('nexit.desactivar_r05_drenaje', :'drenaje_confirmado', true) IS NOT NULL AS drenaje_leido;

DO $$
DECLARE
  -- Inventario de compatibilidad (revisión C04-C01). suc_revisadas: pares (versión, checksum) exactos de sucesoras de NEX-085 ya revisadas. Hoy: ninguna.
  c_nex084 CONSTANT text := '38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854';
  c_nex085 CONSTANT text := '34f57411cef8f17c01f249b6e21e1904c8aa7aecd83718965bcfbadd4b29c7d7';
  suc_revisadas CONSTANT text[][] := ARRAY[]::text[][];
  -- Inventario de objetos (firmas exactas de NEX-084, ayudante corregido por NEX-085): 31 auxiliares + ayudante = 32; 7 escrituras; 3 lecturas; 42 en total.
  internas CONSTANT text[] := ARRAY[
    'public.nex_e03_r05_estado_guarda()', 'public.fe_e03_r05_operacion_inicio_guarda()', 'public.fe_e03_r05_evidencia_guarda()', 'public.fe_e03_r05_post_grande_guarda()',
    'public.fe_e03_r05_claves_exactas(jsonb, text[])', 'public.fe_e03_r05_bool(jsonb)', 'public.fe_e03_r05_entero(jsonb, numeric, numeric)',
    'public.fe_e03_r05_texto(jsonb, integer, boolean)', 'public.fe_e03_r05_enum(jsonb, text[])', 'public.fe_e03_r05_lote_valido(text)', 'public.fe_e03_r05_lote_nex080(text)',
    'public.fe_e03_r05_alterado(jsonb)', 'public.fe_e03_r05_astral(text)', 'public.fe_e03_r05_trim_js(text)', 'public.fe_e03_r05_clase_eco(text, jsonb, jsonb, text)',
    'public.fe_e03_r05_token_mensaje(jsonb)', 'public.fe_e03_r05_validar_proyeccion(jsonb, integer, text, text, text, text, jsonb)', 'public.fe_e03_r05_sanear_proyeccion(jsonb)',
    'public.fe_e03_clasificar_recepcion_r05(jsonb, text)', 'public.fe_e03_r05_cotejar(jsonb, jsonb, boolean, boolean)',
    'public.fe_e03_r05_procesar_proyeccion(jsonb, integer, text, text, text, text, jsonb, jsonb, boolean, boolean)', 'public.fe_e03_r05_exigir_activo()',
    'public.fe_e03_r05_preparar(uuid, uuid, uuid)', 'public.fe_e03_r05_hash_testigo(text)', 'public.fe_e03_r05_operacion(uuid, uuid, uuid, uuid, text)',
    'public.fe_e03_r05_no_vigente(uuid, uuid, uuid, text)', 'public.fe_e03_r05_token_rechazado_post1(uuid, uuid, uuid)', 'public.fe_e03_r05_posts(uuid, uuid, uuid)',
    'public.fe_e03_r05_ultima_actividad(uuid, uuid, uuid)', 'public.fe_e03_r05_abiertas(timestamptz)', 'public.fe_e03_r05_derivar_cierre(uuid, uuid, uuid)',
    'public.nex_aplicar_grants_facturacion_e03_r05()'];
  escrituras CONSTANT text[] := ARRAY[
    'public.fe_e03_iniciar_envio_r05(uuid,uuid,uuid,boolean,uuid,text,jsonb)',
    'public.fe_e03_registrar_autenticacion_r05(uuid,uuid,uuid,uuid,text,text,text,text,integer)',
    'public.fe_e03_registrar_post_r05(uuid,uuid,uuid,uuid,text,smallint,text)',
    'public.fe_e03_registrar_salida_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)',
    'public.fe_e03_registrar_no_transmitido_r05(uuid,uuid,uuid,uuid,text,text)',
    'public.fe_e03_cerrar_envio_r05(uuid,uuid,uuid,uuid,text,jsonb)',
    'public.fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)'];
  lecturas CONSTANT text[] := ARRAY[
    'public.fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid)', 'public.fe_e03_estado_operacion_r05(uuid,uuid,uuid,uuid)',
    'public.fe_e03_conexion_referencia_r05(uuid,uuid,uuid)'];
  guardas CONSTANT text[] := ARRAY['public.nex_e03_r05_estado_guarda()', 'public.fe_e03_r05_operacion_inicio_guarda()',
                                   'public.fe_e03_r05_evidencia_guarda()', 'public.fe_e03_r05_post_grande_guarda()'];
  legado CONSTANT text[] := ARRAY['public.fe_e03_iniciar_envio(uuid,uuid,uuid,boolean)',
    'public.fe_e03_registrar_evento(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text)',
    'public.fe_e03_cerrar_envio(uuid,uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,jsonb)'];
  app CONSTANT text[] := ARRAY['public.fe_documento_iniciar_envio(uuid,uuid,uuid,boolean)',
    'public.fe_documento_registrar_envio_r05(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb)'];
  tablas_r05 CONSTANT text[] := ARRAY['public.documento_electronico_envio_operaciones_r05', 'public.documento_electronico_envio_posts_grandes_r05',
    'public.documento_electronico_envio_autenticaciones_r05', 'public.documento_electronico_envio_proyecciones_r05', 'public.documento_electronico_envio_cierres_r05',
    'public.documento_electronico_envio_salidas_tardias_r05'];
  t_operaciones CONSTANT text := 'public.documento_electronico_envio_operaciones_r05';
  t_estado CONSTANT text := 'public.nex_e03_r05_estado';
  t_nex072 CONSTANT text := 'public.documento_electronico_envio_evidencias';
  -- Las DIEZ columnas que el ayudante NEX-085 concede por SELECT en operaciones_r05 (lista efectiva del ayudante; testigo_sha256 queda fuera).
  cols_operaciones CONSTANT text[] := ARRAY['operacion_id', 'empresa_id', 'documento_id', 'version', 'correlacion_id', 'actor_id', 'confirma_rechazo', 'conexion',
                                            'payload_hash', 'creado_at'];
  -- Una sola consulta de ACL efectiva, usada ANTES del cambio (modo inicial) y DESPUÉS del ayudante (modo REVERTIDO). Devuelve NULL si no hay desvíos.
  -- $1 rol runtime · $2 internos (32) · $3 escrituras (7) · $4 lecturas (3) · $5 escrituras con EXECUTE esperado · $6 E03 antiguas + ayudante NEX-072 · $7 camino NEX-062/080
  -- $8 columnas autorizadas · $9 tablas sin DML de runtime (6 R05 + estado + NEX-072) · $10 tablas con SELECT de tabla esperado (5 R05 + estado + NEX-072) · $11 operaciones_r05
  c_acl CONSTANT text := $q$
    SELECT string_agg(d, '; ' ORDER BY d) FROM (
      SELECT 'EXECUTE WITH GRANT OPTION de runtime en ' || f FROM unnest($2 || $3 || $4) f WHERE has_function_privilege($1, f, 'EXECUTE WITH GRANT OPTION')
      UNION ALL
      SELECT 'PUBLIC con EXECUTE en ' || f FROM unnest($2 || $3 || $4) f WHERE has_function_privilege('public', f, 'EXECUTE')
      UNION ALL
      SELECT 'interno/ayudante con EXECUTE o entrada directa de runtime: ' || f FROM unnest($2) f
       WHERE has_function_privilege($1, f, 'EXECUTE')
          OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid = to_regprocedure(f) AND a.grantee = $1)
      UNION ALL
      SELECT 'lectura sin EXECUTE de runtime: ' || f FROM unnest($4) f WHERE NOT has_function_privilege($1, f, 'EXECUTE')
      UNION ALL
      SELECT CASE WHEN $5 THEN 'escritura sin EXECUTE de runtime (modo ACTIVO): ' ELSE 'escritura con EXECUTE o entrada directa de runtime (modo REVERTIDO): ' END || f
        FROM unnest($3) f
       WHERE CASE WHEN $5 THEN NOT has_function_privilege($1, f, 'EXECUTE')
                  ELSE has_function_privilege($1, f, 'EXECUTE')
                       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid = to_regprocedure(f) AND a.grantee = $1) END
      UNION ALL
      SELECT 'SELECT de tabla de runtime en operaciones_r05' WHERE has_table_privilege($1, $11, 'SELECT')
      UNION ALL
      SELECT CASE WHEN a.attname::text = ANY ($8) THEN 'falta SELECT autorizado en operaciones_r05.' ELSE 'SELECT no autorizado en operaciones_r05.' END || a.attname::text
        FROM pg_attribute a
       WHERE a.attrelid = to_regclass($11) AND a.attnum > 0 AND NOT a.attisdropped
         AND has_column_privilege($1, a.attrelid, a.attnum, 'SELECT') IS DISTINCT FROM (a.attname::text = ANY ($8))
      UNION ALL
      SELECT 'columna autorizada inexistente en operaciones_r05: ' || c FROM unnest($8) c
       WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass($11) AND a.attnum > 0 AND NOT a.attisdropped AND a.attname::text = c)
      UNION ALL
      SELECT 'privilegio de tabla ' || p || ' de runtime en ' || t FROM unnest($9) t, unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
       WHERE has_table_privilege($1, t, p)
      UNION ALL
      SELECT 'privilegio ' || p || ' de tabla o por columna de runtime en ' || t FROM unnest($9) t, unnest(ARRAY['INSERT', 'UPDATE']) p
       WHERE has_any_column_privilege($1, t, p)
      UNION ALL
      SELECT 'falta SELECT previsto de runtime en ' || t FROM unnest($10) t WHERE NOT has_table_privilege($1, t, 'SELECT')
      UNION ALL
      SELECT 'camino vigente NEX-062/NEX-080 sin EXECUTE de runtime: ' || f FROM unnest($7) f WHERE NOT has_function_privilege($1, f, 'EXECUTE')
      UNION ALL
      SELECT 'función E03 antigua o ayudante NEX-072 con EXECUTE de runtime: ' || f FROM unnest($6) f WHERE has_function_privilege($1, f, 'EXECUTE')
    ) x(d)
  $q$;
  v_marca text := current_setting('nexit.desactivar_r05_tx', true);
  v_reconocidas text := current_setting('nexit.desactivar_r05_huerfanas', true);
  v_rt oid;
  v_dueno oid;
  v_ayud pg_proc%ROWTYPE;
  v_t text;
  v_n bigint;
  v_modo text;
  v_modo_inicial text;
  v_cambiado timestamptz;
  v_motivo text;
  v_corte timestamptz;
  v_abiertas bigint;
  v_recientes bigint;
  v_huerfanas bigint;
  v_r05_antes bigint;
  v_r05_despues bigint;
  v_nex072_antes bigint;
  v_nex072_despues bigint;
  v_mig_antes text;
  v_mig_despues text;
  v_trg_antes bigint;
  v_trg_despues bigint;
BEGIN
  -- ── 2) Transacción única, aislamiento efectivo, lock_timeout local y confirmaciones del operador (sin bloqueos ni lecturas de datos todavía) ──
  IF v_marca IS DISTINCT FROM pg_backend_pid()::text || '@' || transaction_timestamp()::text THEN
    RAISE EXCEPTION 'desactivar-envio-r05: no corre en una transacción única con el resto del archivo: ejecutar con psql -X -v ON_ERROR_STOP=1 -1 … -f - (sin -1 o sin -f, psql no envuelve el archivo en una transacción).'
      USING ERRCODE = 'P0001';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'desactivar-envio-r05: aislamiento efectivo % distinto de READ COMMITTED (SET TRANSACTION no fue la primera sentencia): no se continúa.', current_setting('transaction_isolation')
      USING ERRCODE = 'P0001';
  END IF;
  IF current_setting('lock_timeout') <> '5s' THEN
    RAISE EXCEPTION 'desactivar-envio-r05: lock_timeout local no vigente (%).', current_setting('lock_timeout') USING ERRCODE = 'P0001';
  END IF;
  IF current_setting('nexit.desactivar_r05_backup', true) IS DISTINCT FROM 'SI' THEN
    RAISE EXCEPTION 'desactivar-envio-r05: falta -v backup_verificado=SI (backup reciente con restauración comprobada).' USING ERRCODE = 'P0001';
  END IF;
  IF current_setting('nexit.desactivar_r05_instrumentacion', true) IS DISTINCT FROM 'SI' THEN
    RAISE EXCEPTION 'desactivar-envio-r05: falta -v instrumentacion_desactivada=SI (envío R05 desactivado en todas las instancias).' USING ERRCODE = 'P0001';
  END IF;
  IF current_setting('nexit.desactivar_r05_drenaje', true) IS DISTINCT FROM 'SI' THEN
    RAISE EXCEPTION 'desactivar-envio-r05: falta -v drenaje_confirmado=SI (ventana de drenaje de 15 minutos cumplida o instancias reiniciadas).' USING ERRCODE = 'P0001';
  END IF;
  IF v_reconocidas IS NULL OR v_reconocidas !~ '^[0-9]{1,9}$' THEN
    RAISE EXCEPTION 'desactivar-envio-r05: falta -v huerfanas=N (entero no negativo, solo dígitos: operaciones abiertas antiguas que el responsable reconoce; 0 si no hay).' USING ERRCODE = 'P0001';
  END IF;

  -- ── 3) Coordinación con migraciones: mismo bloqueo consultivo transaccional que el runner (antes de la fila de modo) ──
  PERFORM pg_advisory_xact_lock(7340001);

  -- ── 4) Inventario exacto de migraciones y compatibilidad cerrada por defecto, bajo el bloqueo ──
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'desactivar-envio-r05: no existe schema_migrations.' USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(coalesce(quote_literal(s.version), 'NULL'), ', ' ORDER BY s.version) INTO v_t
    FROM public.schema_migrations s
   WHERE s.version IS NULL OR s.version !~ '^NEX-[0-9]{3}$' OR s.version = 'NEX-000';
  IF v_t IS NOT NULL THEN
    RAISE EXCEPTION 'desactivar-envio-r05: versiones no canónicas o NEX-000 en schema_migrations: %. No se continúa.', v_t USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(x.version || ' ×' || x.n, ', ' ORDER BY x.version) INTO v_t
    FROM (SELECT s.version, count(*) AS n FROM public.schema_migrations s GROUP BY s.version HAVING count(*) > 1) x;
  IF v_t IS NOT NULL THEN
    RAISE EXCEPTION 'desactivar-envio-r05: versiones duplicadas en schema_migrations: %.', v_t USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(e.v, ', ' ORDER BY e.v) INTO v_t
    FROM (SELECT 'NEX-' || lpad(g::text, 3, '0') AS v FROM generate_series(1, 85) g
          EXCEPT SELECT s.version FROM public.schema_migrations s) e;
  IF v_t IS NOT NULL THEN
    RAISE EXCEPTION 'desactivar-envio-r05: faltan versiones obligatorias de NEX-001…NEX-085: %.', v_t USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-084' AND checksum = c_nex084) THEN
    RAISE EXCEPTION 'desactivar-envio-r05: NEX-084 no está registrada con el checksum revisado %.', c_nex084 USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-085' AND checksum = c_nex085) THEN
    RAISE EXCEPTION 'desactivar-envio-r05: NEX-085 no está registrada con el checksum revisado %: la combinación revisada es NEX-084 + NEX-085.', c_nex085 USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(s.version || ' (' || coalesce(s.checksum, 'NULL') || ')', ', ' ORDER BY s.version) INTO v_t
    FROM public.schema_migrations s
   WHERE s.version COLLATE "C" > 'NEX-085'
     AND NOT EXISTS (SELECT 1 FROM generate_subscripts(suc_revisadas, 1) i WHERE suc_revisadas[i][1] = s.version AND suc_revisadas[i][2] = s.checksum);
  IF v_t IS NOT NULL THEN
    RAISE EXCEPTION 'desactivar-envio-r05: migración(es) posterior(es) sin revisión de compatibilidad: %. Se requiere una nueva revisión auditada de este script; no hay bypass.', v_t
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 4b) Catálogo: rol, firmas, retornos, dueño, ayudante corregido, tablas, disparadores ──
  SELECT oid INTO v_rt FROM pg_roles WHERE rolname = 'nexit_runtime';
  IF v_rt IS NULL THEN
    RAISE EXCEPTION 'desactivar-envio-r05: no existe el rol nexit_runtime (obligatorio en VM; para pruebas usar un clúster descartable con el mismo rol).' USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(f, ', ') INTO v_t FROM unnest(internas || escrituras || lecturas || legado || app
      || ARRAY['public.nex_aplicar_grants_runtime()', 'public.nex_aplicar_grants_runtime_base()', 'public.nex_aplicar_grants_facturacion_e03()',
               'public.fe_e03_evidencia_inmutable()', 'public.nex_reinicio_demo_activo(uuid)']) f
   WHERE to_regprocedure(f) IS NULL;
  IF v_t IS NOT NULL THEN
    RAISE EXCEPTION 'desactivar-envio-r05: faltan funciones esperadas (firma exacta): %.', v_t USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_ayud FROM pg_proc WHERE oid = to_regprocedure('public.nex_aplicar_grants_facturacion_e03_r05()');
  v_dueno := v_ayud.proowner;
  IF v_ayud.prorettype <> 'void'::regtype OR v_ayud.pronargs <> 0 OR v_ayud.prosecdef
     OR (SELECT lanname FROM pg_language WHERE oid = v_ayud.prolang) <> 'plpgsql' THEN
    RAISE EXCEPTION 'desactivar-envio-r05: el ayudante R05 no tiene la forma esperada (void, sin argumentos, SECURITY INVOKER, plpgsql).' USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(f, ', ') INTO v_t FROM unnest(internas) f
   WHERE position(format('REVOKE ALL ON FUNCTION %s FROM nexit_runtime;', f) IN v_ayud.prosrc) = 0;
  IF v_t IS NOT NULL OR position('testigo_sha256' IN v_ayud.prosrc) > 0 OR position('IF v_modo = ''ACTIVO'' THEN' IN v_ayud.prosrc) = 0 THEN
    RAISE EXCEPTION 'desactivar-envio-r05: el ayudante R05 no es el corregido por NEX-085 (falta REVOKE por firma en: %); no se restaura ni redefine aquí.', coalesce(v_t, 'cuerpo')
      USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(f, ', ') INTO v_t FROM unnest(internas || escrituras || lecturas) f
   WHERE (SELECT p.proowner FROM pg_proc p WHERE p.oid = to_regprocedure(f)) <> v_dueno;
  IF v_t IS NOT NULL THEN
    RAISE EXCEPTION 'desactivar-envio-r05: dueño distinto del ayudante en: %.', v_t USING ERRCODE = 'P0001';
  END IF;
  IF NOT pg_has_role(current_user, v_dueno, 'USAGE') THEN
    RAISE EXCEPTION 'desactivar-envio-r05: el usuario % no es el dueño de los objetos R05 ni miembro de ese rol.', current_user USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM pg_proc p WHERE p.oid = ANY (SELECT to_regprocedure(g)::oid FROM unnest(guardas) g) AND p.prorettype = 'trigger'::regtype) <> 4 THEN
    RAISE EXCEPTION 'desactivar-envio-r05: los cuatro guardas de NEX-084 deben ser funciones de disparador.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.fe_e03_r05_abiertas(timestamptz)') AND p.proretset
                   AND p.proallargtypes = ARRAY['timestamptz'::regtype, 'bigint'::regtype, 'bigint'::regtype, 'bigint'::regtype]::oid[]
                   AND p.proargnames = ARRAY['p_corte', 'o_abiertas', 'o_recientes', 'o_antiguas']) THEN
    RAISE EXCEPTION 'desactivar-envio-r05: fe_e03_r05_abiertas(timestamptz) no tiene la forma de NEX-084 (o_abiertas, o_recientes, o_antiguas).' USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(t, ', ') INTO v_t FROM unnest(tablas_r05 || ARRAY[t_estado, t_nex072]) t
   WHERE to_regclass(t) IS NULL;
  IF v_t IS NOT NULL THEN
    RAISE EXCEPTION 'desactivar-envio-r05: faltan tablas esperadas: %.', v_t USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_trg_antes FROM pg_trigger g
   WHERE NOT g.tgisinternal AND g.tgenabled = 'O'
     AND (g.tgfoid = ANY (SELECT to_regprocedure(x)::oid FROM unnest(guardas) x)
          OR (g.tgfoid = to_regprocedure('public.fe_e03_evidencia_inmutable()') AND g.tgrelid = ANY (SELECT to_regclass(x)::oid FROM unnest(tablas_r05) x)));
  IF v_trg_antes <> 17 THEN
    RAISE EXCEPTION 'desactivar-envio-r05: se esperaban 17 disparadores R05 habilitados (5 de guarda + 12 de inmutabilidad) y hay %.', v_trg_antes USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(version || ':' || coalesce(checksum, 'NULL'), ',' ORDER BY version) INTO v_mig_antes FROM public.schema_migrations;

  -- ── 5) Fila de coordinación FOR UPDATE (espera a toda escritura R05 en curso, que la tiene FOR SHARE) ──
  SELECT modo, cambiado_at, motivo INTO v_modo, v_cambiado, v_motivo FROM public.nex_e03_r05_estado WHERE id FOR UPDATE;
  IF v_modo IS NULL OR (SELECT count(*) FROM public.nex_e03_r05_estado) <> 1 THEN
    RAISE EXCEPTION 'desactivar-envio-r05: nex_e03_r05_estado no tiene exactamente una fila de modo: estado mixto, diagnosticar.' USING ERRCODE = 'P0001';
  END IF;
  IF v_modo NOT IN ('ACTIVO', 'REVERTIDO') THEN
    RAISE EXCEPTION 'desactivar-envio-r05: modo desconocido %.', v_modo USING ERRCODE = 'P0001';
  END IF;
  v_modo_inicial := v_modo;

  -- ── 5b) ACL PREVIA completa según el modo inicial (leído bajo el bloqueo). No se corrige ni se concede nada aquí: cualquier desvío aborta ──
  EXECUTE c_acl INTO v_t
    USING v_rt, internas, escrituras, lecturas, (v_modo_inicial = 'ACTIVO'), legado || ARRAY['public.nex_aplicar_grants_facturacion_e03()'], app,
          cols_operaciones, tablas_r05 || ARRAY[t_estado, t_nex072], tablas_r05[2:6] || ARRAY[t_estado, t_nex072], t_operaciones;
  IF v_t IS NOT NULL THEN
    RAISE EXCEPTION 'desactivar-envio-r05: ACL previa incoherente con NEX-085 en modo %: %. Diagnosticar con verificar-NEX-085.sql; sin GRANT/REVOKE manual.', v_modo_inicial, v_t
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 6) Línea base de evidencia, YA bajo FOR UPDATE (READ COMMITTED: instantánea nueva que incluye toda escritura R05 confirmada antes del bloqueo) ──
  v_r05_antes := 0;
  FOREACH v_t IN ARRAY tablas_r05 LOOP
    EXECUTE format('SELECT count(*) FROM %s', v_t) INTO v_n;
    v_r05_antes := v_r05_antes + v_n;
  END LOOP;
  EXECUTE format('SELECT count(*) FROM %s', t_nex072) INTO v_nex072_antes;

  -- ── 7–9) Un único corte bajo el bloqueo; definición única de operación abierta y última actividad (NEX-084) ──
  v_corte := clock_timestamp();
  SELECT x.o_abiertas, x.o_recientes, x.o_antiguas INTO v_abiertas, v_recientes, v_huerfanas FROM public.fe_e03_r05_abiertas(v_corte) x;
  PERFORM set_config('nexit.desactivar_r05_modo_inicial', v_modo_inicial, true),
          set_config('nexit.desactivar_r05_corte', v_corte::text, true),
          set_config('nexit.desactivar_r05_abiertas', v_abiertas::text, true),
          set_config('nexit.desactivar_r05_recientes', v_recientes::text, true),
          set_config('nexit.desactivar_r05_antiguas', v_huerfanas::text, true);
  IF v_recientes > 0 THEN
    RAISE EXCEPTION 'desactivar-envio-r05: % operación(es) R05 abierta(s) con actividad en los 10 minutos previos al corte %: puede haber un proceso vivo. Esperar el drenaje y repetir.',
      v_recientes, v_corte USING ERRCODE = 'P0001';
  END IF;
  IF v_huerfanas <> v_reconocidas::bigint THEN
    RAISE EXCEPTION 'desactivar-envio-r05: hay % operación(es) R05 abierta(s) antigua(s) y se reconocieron %: revisar verificar-NEX-084.sql §2 y repetir con el número exacto.',
      v_huerfanas, v_reconocidas USING ERRCODE = 'P0001';
  END IF;

  -- ── 10) Cambio de modo (solo si ACTIVO; si ya REVERTIDO no se toca la fila ni se reactiva) ──
  IF v_modo = 'ACTIVO' THEN
    UPDATE public.nex_e03_r05_estado
       SET modo = 'REVERTIDO', cambiado_at = now(),
           motivo = left(format('desactivar-envio-r05 (C04-C01, NEX-084+085): corte %s; %s órfana(s) reconocida(s); backup, instrumentación y drenaje declarados', v_corte, v_huerfanas), 300)
     WHERE id;
    PERFORM set_config('nexit.desactivar_r05_resultado', 'REVERTIDO (pendiente del COMMIT de psql)', true);
  ELSE
    PERFORM set_config('nexit.desactivar_r05_resultado', 'YA_REVERTIDO: fila sin cambios; solo se reaplicó el ayudante corregido (pendiente del COMMIT de psql)', true);
    RAISE NOTICE 'desactivar-envio-r05: el modo ya era REVERTIDO; no se cambia cambiado_at ni motivo.';
  END IF;

  -- ── 11) Solo el ayudante corregido (no se redefine; ni wrapper ni base) ──
  PERFORM public.nex_aplicar_grants_facturacion_e03_r05();

  -- ── 12) Postcondiciones dentro de la transacción (cualquier desvío aborta: la transacción no se confirma) ──
  SELECT modo INTO v_modo FROM public.nex_e03_r05_estado WHERE id;
  IF v_modo <> 'REVERTIDO' THEN
    RAISE EXCEPTION 'desactivar-envio-r05 [post]: el modo no quedó REVERTIDO.' USING ERRCODE = 'P0001';
  END IF;
  IF v_modo_inicial = 'REVERTIDO'
     AND (SELECT cambiado_at IS DISTINCT FROM v_cambiado OR motivo IS DISTINCT FROM v_motivo FROM public.nex_e03_r05_estado WHERE id) THEN
    RAISE EXCEPTION 'desactivar-envio-r05 [post]: modo ya REVERTIDO pero cambiaron cambiado_at o motivo.' USING ERRCODE = 'P0001';
  END IF;
  EXECUTE c_acl INTO v_t
    USING v_rt, internas, escrituras, lecturas, false, legado || ARRAY['public.nex_aplicar_grants_facturacion_e03()'], app,
          cols_operaciones, tablas_r05 || ARRAY[t_estado, t_nex072], tablas_r05[2:6] || ARRAY[t_estado, t_nex072], t_operaciones;
  IF v_t IS NOT NULL THEN
    RAISE EXCEPTION 'desactivar-envio-r05 [post]: ACL tras el ayudante distinta de la esperada en REVERTIDO: %.', v_t USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_trg_despues FROM pg_trigger g
   WHERE NOT g.tgisinternal AND g.tgenabled = 'O'
     AND (g.tgfoid = ANY (SELECT to_regprocedure(x)::oid FROM unnest(guardas) x)
          OR (g.tgfoid = to_regprocedure('public.fe_e03_evidencia_inmutable()') AND g.tgrelid = ANY (SELECT to_regclass(x)::oid FROM unnest(tablas_r05) x)));
  SELECT string_agg(version || ':' || coalesce(checksum, 'NULL'), ',' ORDER BY version) INTO v_mig_despues FROM public.schema_migrations;
  v_r05_despues := 0;
  FOREACH v_t IN ARRAY tablas_r05 LOOP
    EXECUTE format('SELECT count(*) FROM %s', v_t) INTO v_n;
    v_r05_despues := v_r05_despues + v_n;
  END LOOP;
  EXECUTE format('SELECT count(*) FROM %s', t_nex072) INTO v_nex072_despues;
  IF v_trg_despues <> v_trg_antes OR v_mig_despues IS DISTINCT FROM v_mig_antes THEN
    RAISE EXCEPTION 'desactivar-envio-r05 [post]: cambiaron los disparadores habilitados (%→%) o los registros de migraciones.', v_trg_antes, v_trg_despues USING ERRCODE = 'P0001';
  END IF;
  IF v_r05_despues <> v_r05_antes OR v_nex072_despues <> v_nex072_antes THEN
    RAISE EXCEPTION 'desactivar-envio-r05 [post]: cambió el número de filas de evidencia bajo el bloqueo (R05 %→%, NEX-072 %→%): actividad no coordinada; ventana no exclusiva.',
      v_r05_antes, v_r05_despues, v_nex072_antes, v_nex072_despues USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('nexit.desactivar_r05_filas_r05', v_r05_despues::text, true),
          set_config('nexit.desactivar_r05_filas_nex072', v_nex072_despues::text, true);
  RAISE NOTICE 'desactivar-envio-r05: postcondiciones OK dentro de la transacción (modo REVERTIDO; 3 lecturas; 0/7 escrituras; 0/32 internos; PUBLIC 0/42; sin grant option; SELECT 10 columnas; sin DML). Aún NO confirmado: el COMMIT lo hace psql -1 al terminar.';
END $$;

-- ── 13) Informe (misma transacción, ANTES del COMMIT de psql -1): valores calculados bajo el bloqueo; sin identificadores de documento, datos fiscales, credenciales ni testigo.
--       Este informe NO prueba el commit. Solo el resultado B (código 0 y COMMIT reconocido) más la verificación posterior independiente lo confirman; ante cualquier duda,
--       resultado C (desconocido): no repetir, consultar en solo lectura y diagnosticar.
SELECT modo, cambiado_at, motivo FROM public.nex_e03_r05_estado;
SELECT current_setting('nexit.desactivar_r05_resultado', true) AS resultado_previo_al_commit,
       current_setting('nexit.desactivar_r05_modo_inicial', true) AS modo_inicial,
       current_setting('transaction_isolation') AS aislamiento,
       current_setting('nexit.desactivar_r05_corte', true) AS corte_bajo_bloqueo,
       current_setting('nexit.desactivar_r05_abiertas', true) AS operaciones_abiertas,
       current_setting('nexit.desactivar_r05_recientes', true) AS recientes_10_min,
       current_setting('nexit.desactivar_r05_antiguas', true) AS antiguas_reconocidas,
       current_setting('nexit.desactivar_r05_filas_r05', true) AS filas_evidencia_r05,
       current_setting('nexit.desactivar_r05_filas_nex072', true) AS filas_evidencia_nex072_legado;
