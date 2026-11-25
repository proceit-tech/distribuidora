-- REVERSIÓN PROTEGIDA de NEX-084 (PRO-312-R02 / Lote A; coherencia R02-C01 F005). NO es una migración: el runner no la ejecuta ni la descubre. Solo con autorización EXPRESA del
-- responsable y en la ventana prevista:
--   psql -X -v ON_ERROR_STOP=1 -1 -v backup_verificado=SI -v instrumentacion_desactivada=SI -v drenaje_confirmado=SI -v huerfanas=<N> -f reversion-NEX-084.sql
-- Nada de esto fue ejecutado por Claude.
--
-- Confirmaciones del operador (obligatorias; SQL NO puede verificar procesos remotos, por eso son declaraciones explícitas y el script se detiene sin ellas):
--   backup_verificado=SI          hay un backup reciente de la base y se comprobó que restaura.
--   instrumentacion_desactivada=SI el envío R05 está desactivado en TODAS las instancias de la aplicación (ninguna llamará fe_e03_*_r05).
--   drenaje_confirmado=SI         tras desactivarlo, se esperó la VENTANA DE DRENAJE de 15 minutos o se reiniciaron todas las instancias (ningún proceso conserva un testigo vivo).
--   huerfanas=<N>                 número EXACTO de operaciones R05 abiertas ANTIGUAS que el responsable reconoce (0 si no hay); ver «Órfanas» abajo y verificar-NEX-084.sql §2.
-- Dos umbrales distintos: la VENTANA DE DRENAJE (15 min, procedimiento del operador antes de ejecutar) y el UMBRAL DE ACTIVIDAD (10 min, comprobado por SQL bajo el bloqueo: una
-- operación abierta con actividad en los últimos 10 minutos aborta la reversión).
--
-- Qué hace (NO destructivo, idempotente):
--   1) bloquea la fila de coordinación nex_e03_r05_estado con FOR UPDATE: espera a toda escritura R05 en curso (cada una la tiene con FOR SHARE desde ANTES de tocar el documento)
--      y, al confirmar, toda escritura posterior ve REVERTIDO y aborta con NEX:E03_R05_REVERTIDO aunque ya hubiera pasado el control de EXECUTE (C02-045);
--   2) con el bloqueo tomado fija UN corte (clock_timestamp) y cuenta las operaciones abiertas con la definición ÚNICA de NEX-084 (fe_e03_r05_abiertas: sin cierre R05; última
--      actividad = raíz, eventos NEX-072, POST grandes, autenticaciones, proyecciones y salidas tardías). Recientes > 0 → aborta (puede haber un proceso vivo: esperar y repetir);
--   3) antiguas (órfanas) ≠ huerfanas → aborta; si coinciden quedan como están (no se cierran ni se inventa cierre);
--   4) pasa el modo a REVERTIDO y reaplica el ayudante R05, que RETIRA el EXECUTE de las 7 escrituras R05 a nexit_runtime (las 3 lecturas y el SELECT se conservan).
--   El informe final muestra EXACTAMENTE el corte y los conteos calculados bajo el bloqueo (no los recalcula).
-- Qué NO hace: no borra tablas, filas, funciones, disparadores ni la fila 'NEX-084' de schema_migrations; no modifica checksums; no toca NEX-062/072/079/080 ni la aplicación vigente
-- (que sigue usando fe_documento_iniciar_envio + fe_documento_registrar_envio_r05); no restituye el EXECUTE de las funciones de escritura de NEX-072 a nexit_runtime (la aplicación no
-- las usa; restituirlo sería una decisión separada). La evidencia R05 ya registrada queda íntegra y legible.
-- Límite reconocido: ni el drenaje ni el umbral de actividad PRUEBAN la ausencia de un proceso vivo (C02-045). Un proceso que conserve su testigo y escriba después recibe
-- NEX:E03_R05_REVERTIDO; su salida (si la hubo) solo podrá conciliarse por consulta en la misma cuenta. Las operaciones órfanas quedan abiertas en la evidencia R05; el documento sigue la
-- regla vigente de NEX-062 (ENVIANDO > 2 minutos → ENVIO_INDETERMINADO) y la recuperación manual vigente (D4/D5 sin cambios).
-- Reactivación: NO está en este script. Volver a ACTIVO requiere una orden separada (UPDATE del modo + reaplicación del ayudante) con su propia verificación.
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
SET LOCAL lock_timeout = '5s';
SELECT set_config('nexit.reversion_nex084_huerfanas', :'huerfanas', true),
       set_config('nexit.reversion_nex084_backup', :'backup_verificado', true),
       set_config('nexit.reversion_nex084_instrumentacion', :'instrumentacion_desactivada', true),
       set_config('nexit.reversion_nex084_drenaje', :'drenaje_confirmado', true);

DO $$
DECLARE
  v_modo text;
  v_corte timestamptz;
  v_abiertas bigint;
  v_recientes bigint;
  v_huerfanas bigint;
  v_reconocidas text := current_setting('nexit.reversion_nex084_huerfanas', true);
BEGIN
  -- P0: transacción única con lock_timeout local y confirmaciones explícitas del operador
  IF current_setting('lock_timeout') <> '5s' THEN
    RAISE EXCEPTION 'reversion NEX-084: lock_timeout local no vigente (%): ejecutar con psql -1 (transacción única).', current_setting('lock_timeout') USING ERRCODE = 'P0001';
  END IF;
  IF current_setting('nexit.reversion_nex084_backup', true) IS DISTINCT FROM 'SI' THEN
    RAISE EXCEPTION 'reversion NEX-084: falta -v backup_verificado=SI (backup reciente comprobado).' USING ERRCODE = 'P0001';
  END IF;
  IF current_setting('nexit.reversion_nex084_instrumentacion', true) IS DISTINCT FROM 'SI' THEN
    RAISE EXCEPTION 'reversion NEX-084: falta -v instrumentacion_desactivada=SI (envío R05 desactivado en todas las instancias).' USING ERRCODE = 'P0001';
  END IF;
  IF current_setting('nexit.reversion_nex084_drenaje', true) IS DISTINCT FROM 'SI' THEN
    RAISE EXCEPTION 'reversion NEX-084: falta -v drenaje_confirmado=SI (ventana de drenaje de 15 minutos cumplida o instancias reiniciadas).' USING ERRCODE = 'P0001';
  END IF;
  IF v_reconocidas IS NULL OR v_reconocidas !~ '^[0-9]{1,9}$' THEN
    RAISE EXCEPTION 'reversion NEX-084: falta -v huerfanas=<N> (número de operaciones abiertas antiguas que el responsable reconoce; 0 si no hay).' USING ERRCODE = 'P0001';
  END IF;

  -- P1: procedencia exacta
  IF to_regclass('public.schema_migrations') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-084' AND checksum = '12439af60ce0073cc98aebb7e9662312f7a21e46c6a800321319b48b4853248b') THEN
    RAISE EXCEPTION 'reversion NEX-084: schema_migrations no registra NEX-084 con el checksum del archivo versionado: el estado no es atribuible a NEX-084.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version ~ '^NEX-[0-9]{3}$' AND version > 'NEX-084') THEN
    RAISE EXCEPTION 'reversion NEX-084: hay migraciones posteriores registradas; revisar dependencias antes de revertir.' USING ERRCODE = 'P0001';
  END IF;

  -- P2: objetos de NEX-084 presentes (sin ellos el estado es mixto: conciliar a mano)
  IF to_regclass('public.nex_e03_r05_estado') IS NULL OR to_regclass('public.documento_electronico_envio_operaciones_r05') IS NULL
     OR to_regclass('public.documento_electronico_envio_cierres_r05') IS NULL OR to_regclass('public.documento_electronico_envio_posts_grandes_r05') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_facturacion_e03_r05()') IS NULL OR to_regprocedure('public.fe_e03_r05_abiertas(timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'reversion NEX-084: faltan objetos de NEX-084: estado mixto, conciliar a mano.' USING ERRCODE = 'P0001';
  END IF;

  -- 1) Bloqueo exclusivo de coordinación (mismo recurso, mismo orden que las escrituras R05: primero esta fila, después el documento)
  SELECT modo INTO v_modo FROM public.nex_e03_r05_estado WHERE id FOR UPDATE;
  IF v_modo IS NULL THEN
    RAISE EXCEPTION 'reversion NEX-084: falta la fila de modo: estado mixto, conciliar a mano.' USING ERRCODE = 'P0001';
  END IF;

  -- 2) Un único corte, tomado CON el bloqueo; definición única de operación abierta y de última actividad (NEX-084).
  v_corte := clock_timestamp();
  SELECT x.o_abiertas, x.o_recientes, x.o_antiguas INTO v_abiertas, v_recientes, v_huerfanas FROM public.fe_e03_r05_abiertas(v_corte) x;
  PERFORM set_config('nexit.reversion_nex084_corte', v_corte::text, true),
          set_config('nexit.reversion_nex084_abiertas', v_abiertas::text, true),
          set_config('nexit.reversion_nex084_recientes', v_recientes::text, true),
          set_config('nexit.reversion_nex084_antiguas', v_huerfanas::text, true);

  IF v_modo = 'REVERTIDO' THEN
    PERFORM set_config('nexit.reversion_nex084_resultado', 'YA_REVERTIDO: solo se reaplicó el ayudante de privilegios', true);
    RAISE NOTICE 'reversion NEX-084: el modo ya es REVERTIDO; solo se reaplica el ayudante de privilegios (idempotente).';
    PERFORM public.nex_aplicar_grants_facturacion_e03_r05();
    RETURN;
  END IF;

  IF v_recientes > 0 THEN
    RAISE EXCEPTION 'reversion NEX-084: % operación(es) R05 abierta(s) con actividad en los 10 minutos previos al corte: puede haber un proceso vivo. Esperar el drenaje y repetir.', v_recientes
      USING ERRCODE = 'P0001';
  END IF;

  -- 3) Reconocimiento explícito de las órfanas (quedan abiertas, sin cierre inventado)
  IF v_huerfanas <> v_reconocidas::bigint THEN
    RAISE EXCEPTION 'reversion NEX-084: hay % operación(es) R05 abierta(s) antigua(s) y se reconocieron %: revisar verificar-NEX-084.sql §2 y repetir con el número exacto.',
      v_huerfanas, v_reconocidas USING ERRCODE = 'P0001';
  END IF;

  -- 4) Modo REVERTIDO + retiro del EXECUTE de escritura
  UPDATE public.nex_e03_r05_estado SET modo = 'REVERTIDO', cambiado_at = now(),
         motivo = format('reversion-NEX-084: corte %s; %s operación(es) abierta(s) antigua(s) reconocida(s); backup, desactivación y drenaje declarados por el operador', v_corte, v_huerfanas)
   WHERE id;
  PERFORM public.nex_aplicar_grants_facturacion_e03_r05();
  PERFORM set_config('nexit.reversion_nex084_resultado', 'REVERTIDO', true);
  RAISE NOTICE 'reversion NEX-084: modo REVERTIDO; % operación(es) órfana(s) reconocida(s) y conservada(s).', v_huerfanas;
END $$;

-- Informe (misma transacción, antes del COMMIT de psql -1): modo final y los valores EXACTOS calculados bajo el bloqueo; sin identificadores de documento ni contenido.
SELECT modo, cambiado_at, motivo FROM public.nex_e03_r05_estado;
SELECT current_setting('nexit.reversion_nex084_resultado', true) AS resultado,
       current_setting('nexit.reversion_nex084_corte', true) AS corte_bajo_bloqueo,
       current_setting('nexit.reversion_nex084_abiertas', true) AS operaciones_abiertas,
       current_setting('nexit.reversion_nex084_recientes', true) AS recientes_10_min,
       current_setting('nexit.reversion_nex084_antiguas', true) AS antiguas_reconocidas;

-- Conciliación manual (NO automatizada): la fila 'NEX-084' permanece en schema_migrations porque los objetos permanecen (reversión de comportamiento, no de esquema).
-- Para conocer el número de órfanas ANTES de ejecutar este script, usar verificar-NEX-084.sql §2 (misma definición, fe_e03_r05_abiertas).
