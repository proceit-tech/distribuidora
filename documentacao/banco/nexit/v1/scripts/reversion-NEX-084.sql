-- REVERSIÓN PROTEGIDA de NEX-084 (PRO-312-R02 / Lote A). NO es una migración: el runner no la ejecuta ni la descubre. Solo con autorización EXPRESA del responsable, backup previo
-- verificado y ventana de drenaje (sin envíos FE/NCE en curso):
--   psql -X -v ON_ERROR_STOP=1 -1 -v huerfanas=<N> -f reversion-NEX-084.sql
-- donde <N> es el número EXACTO de operaciones R05 abiertas y antiguas que el responsable reconoce (sección «Órfanas»; 0 si no hay). Nada de esto fue ejecutado por Claude.
--
-- Qué hace (NO destructivo, idempotente):
--   1) bloquea la fila de coordinación nex_e03_r05_estado con FOR UPDATE: espera a toda escritura R05 en curso (cada una la tiene con FOR SHARE desde ANTES de tocar el documento)
--      y, al confirmar, toda escritura posterior ve REVERTIDO y aborta con NEX:E03_R05_REVERTIDO aunque ya hubiera pasado el control de EXECUTE (C02-045);
--   2) aborta si hay operaciones R05 abiertas RECIENTES (último evento < 10 minutos): pueden tener un proceso vivo; esperar y repetir;
--   3) exige reconocer explícitamente las operaciones abiertas antiguas (órfanas): su número debe coincidir con -v huerfanas; quedan como están (no se cierran ni se inventa cierre);
--   4) pasa el modo a REVERTIDO y reaplica el ayudante R05, que RETIRA el EXECUTE de las 7 escrituras R05 a nexit_runtime (las 2 lecturas y el SELECT se conservan).
-- Qué NO hace: no borra tablas, filas, funciones, disparadores ni la fila 'NEX-084' de schema_migrations; no modifica checksums; no toca NEX-062/072/079/080 ni la aplicación vigente
-- (que sigue usando fe_documento_iniciar_envio + fe_documento_registrar_envio_r05); no restituye el EXECUTE de las funciones de escritura de NEX-072 a nexit_runtime (la aplicación no
-- las usa; restituirlo sería una decisión separada). La evidencia R05 ya registrada queda íntegra y legible.
-- Límite reconocido: el tiempo de drenaje NO prueba la ausencia de un proceso vivo (C02-045). Un proceso que conserve su testigo y escriba después recibe NEX:E03_R05_REVERTIDO; su salida
-- (si la hubo) solo podrá conciliarse por consulta en la misma cuenta. Las operaciones órfanas quedan abiertas en la evidencia R05; el documento sigue la regla vigente de NEX-062
-- (ENVIANDO > 2 minutos → ENVIO_INDETERMINADO) y la recuperación manual vigente (D4/D5 sin cambios).
-- Reactivación: NO está en este script. Volver a ACTIVO requiere una orden separada (UPDATE del modo + reaplicación del ayudante) con su propia verificación.
SET LOCAL lock_timeout = '5s';
SELECT set_config('nexit.reversion_nex084_huerfanas', :'huerfanas', true);

DO $$
DECLARE
  v_modo text;
  v_recientes bigint;
  v_huerfanas bigint;
  v_reconocidas text := current_setting('nexit.reversion_nex084_huerfanas', true);
BEGIN
  -- P0: transacción única con lock_timeout local
  IF current_setting('lock_timeout') <> '5s' THEN
    RAISE EXCEPTION 'reversion NEX-084: lock_timeout local no vigente (%): ejecutar con psql -1 (transacción única).', current_setting('lock_timeout') USING ERRCODE = 'P0001';
  END IF;
  IF v_reconocidas IS NULL OR v_reconocidas !~ '^[0-9]{1,9}$' THEN
    RAISE EXCEPTION 'reversion NEX-084: falta -v huerfanas=<N> (número de operaciones abiertas antiguas que el responsable reconoce; 0 si no hay).' USING ERRCODE = 'P0001';
  END IF;

  -- P1: procedencia exacta
  IF to_regclass('public.schema_migrations') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-084' AND checksum = 'ec59bd921e3fbf77aae741df2ffb5f2577bacd03c5ba230dd1ea683f3411aff3') THEN
    RAISE EXCEPTION 'reversion NEX-084: schema_migrations no registra NEX-084 con el checksum del archivo versionado: el estado no es atribuible a NEX-084.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version ~ '^NEX-[0-9]{3}$' AND version > 'NEX-084') THEN
    RAISE EXCEPTION 'reversion NEX-084: hay migraciones posteriores registradas; revisar dependencias antes de revertir.' USING ERRCODE = 'P0001';
  END IF;

  -- P2: objetos de NEX-084 presentes (sin ellos el estado es mixto: conciliar a mano)
  IF to_regclass('public.nex_e03_r05_estado') IS NULL OR to_regclass('public.documento_electronico_envio_operaciones_r05') IS NULL
     OR to_regclass('public.documento_electronico_envio_cierres_r05') IS NULL OR to_regclass('public.documento_electronico_envio_posts_grandes_r05') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_facturacion_e03_r05()') IS NULL THEN
    RAISE EXCEPTION 'reversion NEX-084: faltan objetos de NEX-084: estado mixto, conciliar a mano.' USING ERRCODE = 'P0001';
  END IF;

  -- 1) Bloqueo exclusivo de coordinación (mismo recurso, mismo orden que las escrituras R05: primero esta fila, después el documento)
  SELECT modo INTO v_modo FROM public.nex_e03_r05_estado WHERE id FOR UPDATE;
  IF v_modo IS NULL THEN
    RAISE EXCEPTION 'reversion NEX-084: falta la fila de modo: estado mixto, conciliar a mano.' USING ERRCODE = 'P0001';
  END IF;
  IF v_modo = 'REVERTIDO' THEN
    RAISE NOTICE 'reversion NEX-084: el modo ya es REVERTIDO; solo se reaplica el ayudante de privilegios (idempotente).';
    PERFORM public.nex_aplicar_grants_facturacion_e03_r05();
    RETURN;
  END IF;

  -- 2) Operaciones abiertas (sin cierre R05). Recientes = algún evento propio en los últimos 10 minutos.
  WITH abiertas AS (
    SELECT o.empresa_id, o.documento_id, o.operacion_id,
           greatest(o.creado_at,
                    (SELECT max(e.creado_at) FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = o.empresa_id AND e.documento_id = o.documento_id AND e.operacion_id = o.operacion_id),
                    (SELECT max(g.creado_at) FROM public.documento_electronico_envio_posts_grandes_r05 g WHERE g.empresa_id = o.empresa_id AND g.documento_id = o.documento_id AND g.operacion_id = o.operacion_id),
                    (SELECT max(a.creado_at) FROM public.documento_electronico_envio_autenticaciones_r05 a WHERE a.empresa_id = o.empresa_id AND a.documento_id = o.documento_id AND a.operacion_id = o.operacion_id)) AS ultimo
      FROM public.documento_electronico_envio_operaciones_r05 o
     WHERE NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_cierres_r05 c WHERE c.operacion_id = o.operacion_id)
  )
  SELECT count(*) FILTER (WHERE ultimo >= now() - interval '10 minutes'), count(*) FILTER (WHERE ultimo < now() - interval '10 minutes')
    INTO v_recientes, v_huerfanas FROM abiertas;
  IF v_recientes > 0 THEN
    RAISE EXCEPTION 'reversion NEX-084: % operación(es) R05 abierta(s) con actividad en los últimos 10 minutos: puede haber un proceso vivo. Esperar el drenaje y repetir.', v_recientes
      USING ERRCODE = 'P0001';
  END IF;

  -- 3) Reconocimiento explícito de las órfanas (quedan abiertas, sin cierre inventado)
  IF v_huerfanas <> v_reconocidas::bigint THEN
    RAISE EXCEPTION 'reversion NEX-084: hay % operación(es) R05 abierta(s) antigua(s) y se reconocieron %: revisar la sección «Órfanas» del informe y repetir con el número exacto.',
      v_huerfanas, v_reconocidas USING ERRCODE = 'P0001';
  END IF;

  -- 4) Modo REVERTIDO + retiro del EXECUTE de escritura
  UPDATE public.nex_e03_r05_estado SET modo = 'REVERTIDO', cambiado_at = now(),
         motivo = format('reversion-NEX-084: %s operación(es) abierta(s) antigua(s) reconocida(s)', v_huerfanas)
   WHERE id;
  PERFORM public.nex_aplicar_grants_facturacion_e03_r05();
  RAISE NOTICE 'reversion NEX-084: modo REVERTIDO; % operación(es) órfana(s) reconocida(s) y conservada(s).', v_huerfanas;
END $$;

-- Informe (dentro de la misma transacción, antes del COMMIT de psql -1): modo final y órfanas reconocidas, sin identificadores de documento ni contenido.
SELECT modo, cambiado_at, motivo FROM public.nex_e03_r05_estado;
SELECT 'Órfanas: operaciones R05 abiertas (sin cierre) por antigüedad del último evento' AS informe,
       count(*) FILTER (WHERE greatest(o.creado_at, coalesce(e.ultimo, o.creado_at)) < now() - interval '10 minutes') AS antiguas,
       count(*) FILTER (WHERE greatest(o.creado_at, coalesce(e.ultimo, o.creado_at)) >= now() - interval '10 minutes') AS recientes
  FROM public.documento_electronico_envio_operaciones_r05 o
  LEFT JOIN LATERAL (SELECT max(x.creado_at) AS ultimo FROM public.documento_electronico_envio_evidencias x
                      WHERE x.empresa_id = o.empresa_id AND x.documento_id = o.documento_id AND x.operacion_id = o.operacion_id) e ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_cierres_r05 c WHERE c.operacion_id = o.operacion_id);

-- Conciliación manual (NO automatizada): la fila 'NEX-084' permanece en schema_migrations porque los objetos permanecen (reversión de comportamiento, no de esquema).
-- Para conocer el número de órfanas ANTES de ejecutar este script, usar la sección 2 de verificar-NEX-084.sql («operaciones R05 sin cierre»).
