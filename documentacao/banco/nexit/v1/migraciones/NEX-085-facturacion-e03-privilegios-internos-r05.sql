-- NEX-085 — PRO-312-R02-C03: corrección EXCLUSIVA de privilegios internos R05 (hallazgo F-VM-084-01). AUTORÍA SOLAMENTE: este archivo no se aplicó a ninguna base;
-- la aplicación en la VM es decisión del responsable (backup previo, scripts/preflight-NEX-085.sql, runner oficial, scripts/verificar-NEX-085.sql).
-- Orden: documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-312-R02-C03-NEX-085-2026-11-25.md. Diagnóstico: documentacao/testes/AUD-CHATGPT-NEXIT-PRO-312-R02-NEX-084-VM-F01-2026-11-25.md.
--
-- Incremental: NO edita NEX-001…084 ni sus checksums (NEX-084 instalada e INMUTABLE, SHA-256 38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854).
-- NO toca nex_aplicar_grants_runtime_base() ni el wrapper nex_aplicar_grants_runtime(), ni la política general de disparadores de otros módulos, ni datos, tablas,
-- disparadores, funciones de negocio o la aplicación vigente (lib/facturacion/envio.ts sigue usando fe_documento_iniciar_envio + fe_documento_registrar_envio_r05).
--
-- Causa (cadena de privilegios, referencias del repositorio):
--   NEX-014:523–536 (base, redefinida luego por NEX-017/NEX-020 con la misma regla) recorre TODAS las funciones públicas: REVOKE ALL de PUBLIC y de nexit_runtime y después
--     GRANT EXECUTE a nexit_runtime en toda función con prorettype = 'trigger' (más una lista nominal).
--   NEX-037:114–122 renombra esa función a nex_aplicar_grants_runtime_base(); NEX-052:146–157 define el wrapper nex_aplicar_grants_runtime(): llama a la base y luego a cada
--     ayudante nex_aplicar_grants_% (0 argumentos, void) en orden alfabético. El runner (scripts/aplicar-migraciones.sh:54–58) reaplica el wrapper al final de cada ejecución.
--   NEX-084:2284–2350 (nex_aplicar_grants_facturacion_e03_r05) solo revoca PUBLIC en sus auxiliares internos: los cuatro disparadores de NEX-084 conservan el GRANT de la base.
--   Evidencia VM: fe_e03_r05_evidencia_guarda(), fe_e03_r05_operacion_inicio_guarda() y fe_e03_r05_post_grande_guarda() con GRANT directo a nexit_runtime (dueño nexit_app);
--   control 63 de verificar-NEX-084.sql = false. nex_e03_r05_estado_guarda() recibe el mismo GRANT de la base (fuera del filtro del control 63; se corrige igual).
--
-- Corrección: se redefine SOLO public.nex_aplicar_grants_facturacion_e03_r05(), con su cuerpo de NEX-084 ÍNTEGRO (mismas revocaciones de PUBLIC, mismo SELECT por columnas sin
-- testigo_sha256, mismas 3 lecturas en ambos modos, mismas 7 escrituras solo en ACTIVO, mismo retorno temprano sin el rol) y se AÑADE, cuando nexit_runtime existe, un
-- REVOKE ALL ... FROM nexit_runtime (EXECUTE y grant option) por FIRMA EXACTA en los 31 auxiliares internos creados por NEX-084 y en el propio ayudante.
-- Persistencia: el ayudante corre después de la base en cada nex_aplicar_grants_runtime() (orden alfabético; la base siempre primero) y ningún ayudante posterior
-- (facturacion_emision, facturacion_envio, …, usuarios_vendedores) concede EXECUTE dinámico; por eso el REVOKE vuelve a imponerse tras cada reaplicación del wrapper.
-- Sin barrido por prefijo: no se revocan funciones ajenas a NEX-084 (p. ej. fe_e03_evidencia_inmutable() de NEX-072 y nex_aplicar_grants_facturacion_e03(), solo verificadas).
-- Disparadores: PostgreSQL comprueba EXECUTE de la función de disparador al CREAR el disparador, no al dispararse; los INSERT/DELETE sobre esas tablas ocurren dentro de funciones
-- SECURITY DEFINER de NEX-072/NEX-084 (runtime no tiene DML directo). Retirar el EXECUTE de runtime no impide que los disparadores se ejecuten (análisis; no verificado en la VM).
-- Sin el rol nexit_runtime (bases efímeras sin rol): el ayudante retorna tras revocar PUBLIC, igual que NEX-084. Esta migración no crea roles.
-- Reversión: no existe reversión rutinaria segura (reintroduciría acceso indebido); scripts/reversion-NEX-085.sql aborta sin modificar nada.

-- 1) Dependencias e inventario (abortan con mensaje claro si algo no coincide).
DO $$
DECLARE
  v_firmas text[] := ARRAY[
    -- 31 auxiliares internos creados por NEX-084
    'public.nex_e03_r05_estado_guarda()',
    'public.fe_e03_r05_operacion_inicio_guarda()',
    'public.fe_e03_r05_evidencia_guarda()',
    'public.fe_e03_r05_post_grande_guarda()',
    'public.fe_e03_r05_claves_exactas(jsonb,text[])',
    'public.fe_e03_r05_bool(jsonb)',
    'public.fe_e03_r05_entero(jsonb,numeric,numeric)',
    'public.fe_e03_r05_texto(jsonb,integer,boolean)',
    'public.fe_e03_r05_enum(jsonb,text[])',
    'public.fe_e03_r05_lote_valido(text)',
    'public.fe_e03_r05_lote_nex080(text)',
    'public.fe_e03_r05_alterado(jsonb)',
    'public.fe_e03_r05_astral(text)',
    'public.fe_e03_r05_trim_js(text)',
    'public.fe_e03_r05_clase_eco(text,jsonb,jsonb,text)',
    'public.fe_e03_r05_token_mensaje(jsonb)',
    'public.fe_e03_r05_validar_proyeccion(jsonb,integer,text,text,text,text,jsonb)',
    'public.fe_e03_r05_sanear_proyeccion(jsonb)',
    'public.fe_e03_clasificar_recepcion_r05(jsonb,text)',
    'public.fe_e03_r05_cotejar(jsonb,jsonb,boolean,boolean)',
    'public.fe_e03_r05_procesar_proyeccion(jsonb,integer,text,text,text,text,jsonb,jsonb,boolean,boolean)',
    'public.fe_e03_r05_exigir_activo()',
    'public.fe_e03_r05_preparar(uuid,uuid,uuid)',
    'public.fe_e03_r05_hash_testigo(text)',
    'public.fe_e03_r05_operacion(uuid,uuid,uuid,uuid,text)',
    'public.fe_e03_r05_no_vigente(uuid,uuid,uuid,text)',
    'public.fe_e03_r05_token_rechazado_post1(uuid,uuid,uuid)',
    'public.fe_e03_r05_posts(uuid,uuid,uuid)',
    'public.fe_e03_r05_ultima_actividad(uuid,uuid,uuid)',
    'public.fe_e03_r05_abiertas(timestamptz)',
    'public.fe_e03_r05_derivar_cierre(uuid,uuid,uuid)',
    -- 7 escrituras
    'public.fe_e03_iniciar_envio_r05(uuid,uuid,uuid,boolean,uuid,text,jsonb)',
    'public.fe_e03_registrar_autenticacion_r05(uuid,uuid,uuid,uuid,text,text,text,text,integer)',
    'public.fe_e03_registrar_post_r05(uuid,uuid,uuid,uuid,text,smallint,text)',
    'public.fe_e03_registrar_salida_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)',
    'public.fe_e03_registrar_no_transmitido_r05(uuid,uuid,uuid,uuid,text,text)',
    'public.fe_e03_cerrar_envio_r05(uuid,uuid,uuid,uuid,text,jsonb)',
    'public.fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)',
    -- 3 lecturas
    'public.fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid)',
    'public.fe_e03_estado_operacion_r05(uuid,uuid,uuid,uuid)',
    'public.fe_e03_conexion_referencia_r05(uuid,uuid,uuid)',
    -- ayudantes de privilegios y wrapper
    'public.nex_aplicar_grants_facturacion_e03_r05()',
    'public.nex_aplicar_grants_facturacion_e03()',
    'public.nex_aplicar_grants_runtime()',
    'public.nex_aplicar_grants_runtime_base()'];
  v_faltan text[];
  v_modo text;
  v_n integer;
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'NEX-085: falta schema_migrations (NEX-001).' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations
                  WHERE version = 'NEX-084' AND checksum = '38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854') THEN
    RAISE EXCEPTION 'NEX-085: NEX-084 no está registrada con el checksum esperado 38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854.'
      USING ERRCODE = 'P0001', HINT = 'NEX-085 solo corrige la versión instalada y auditada de NEX-084; no aplicar sobre otra versión.';
  END IF;

  SELECT array_agg(f ORDER BY f) INTO v_faltan FROM unnest(v_firmas) AS f WHERE to_regprocedure(f) IS NULL;
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-085: faltan funciones esperadas de NEX-084 o del mecanismo de privilegios: %', array_to_string(v_faltan, ', ') USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc
   WHERE oid IN (to_regprocedure('public.nex_e03_r05_estado_guarda()'), to_regprocedure('public.fe_e03_r05_operacion_inicio_guarda()'),
                 to_regprocedure('public.fe_e03_r05_evidencia_guarda()'), to_regprocedure('public.fe_e03_r05_post_grande_guarda()'))
     AND prorettype = 'trigger'::regtype;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'NEX-085: los cuatro guardas de NEX-084 deben ser funciones de disparador (encontradas: %).', v_n USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc
   WHERE oid = to_regprocedure('public.nex_aplicar_grants_facturacion_e03_r05()') AND prorettype = 'void'::regtype AND pronargs = 0 AND NOT prosecdef;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'NEX-085: nex_aplicar_grants_facturacion_e03_r05() no tiene la forma esperada (void, sin argumentos, SECURITY INVOKER).' USING ERRCODE = 'P0001';
  END IF;

  IF to_regclass('public.nex_e03_r05_estado') IS NULL THEN
    RAISE EXCEPTION 'NEX-085: falta la tabla de coordinación nex_e03_r05_estado (NEX-084).' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*), max(modo) INTO v_n, v_modo FROM public.nex_e03_r05_estado;
  IF v_n <> 1 OR v_modo NOT IN ('ACTIVO', 'REVERTIDO') THEN
    RAISE EXCEPTION 'NEX-085: nex_e03_r05_estado debe tener exactamente una fila con modo ACTIVO o REVERTIDO (filas: %, modo: %).', v_n, coalesce(v_modo, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- 2) Ayudante R05 corregido: cuerpo de NEX-084 íntegro + revocación explícita de runtime en los auxiliares internos (por firma exacta).
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_e03_r05() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_modo text;
BEGIN
  REVOKE ALL ON FUNCTION public.nex_e03_r05_estado_guarda() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_operacion_inicio_guarda() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_evidencia_guarda() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_post_grande_guarda() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_claves_exactas(jsonb, text[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_bool(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_entero(jsonb, numeric, numeric) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_texto(jsonb, integer, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_enum(jsonb, text[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_lote_valido(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_lote_nex080(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_alterado(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_astral(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_trim_js(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_clase_eco(text, jsonb, jsonb, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_token_mensaje(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_validar_proyeccion(jsonb, integer, text, text, text, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_sanear_proyeccion(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_clasificar_recepcion_r05(jsonb, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_cotejar(jsonb, jsonb, boolean, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_procesar_proyeccion(jsonb, integer, text, text, text, text, jsonb, jsonb, boolean, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_exigir_activo() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_preparar(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_hash_testigo(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_operacion(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_no_vigente(uuid, uuid, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_token_rechazado_post1(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_posts(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_ultima_actividad(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_abiertas(timestamptz) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_derivar_cierre(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_iniciar_envio_r05(uuid, uuid, uuid, boolean, uuid, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_autenticacion_r05(uuid, uuid, uuid, uuid, text, text, text, text, integer) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_post_r05(uuid, uuid, uuid, uuid, text, smallint, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_no_transmitido_r05(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_cerrar_envio_r05(uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_tardia_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_operacion_por_correlacion_r05(uuid, uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_estado_operacion_r05(uuid, uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_conexion_referencia_r05(uuid, uuid, uuid) FROM PUBLIC;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  -- NEX-085 (F-VM-084-01): la base (NEX-014/017/020, vía el wrapper de NEX-052) concede EXECUTE a nexit_runtime en toda función de disparador; este ayudante corre
  -- después de la base en cada reaplicación y retira de forma explícita EXECUTE (y grant option) de runtime en TODOS los auxiliares internos de NEX-084 y en sí mismo.
  REVOKE ALL ON FUNCTION public.nex_e03_r05_estado_guarda() FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_operacion_inicio_guarda() FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_evidencia_guarda() FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_post_grande_guarda() FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_claves_exactas(jsonb, text[]) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_bool(jsonb) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_entero(jsonb, numeric, numeric) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_texto(jsonb, integer, boolean) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_enum(jsonb, text[]) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_lote_valido(text) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_lote_nex080(text) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_alterado(jsonb) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_astral(text) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_trim_js(text) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_clase_eco(text, jsonb, jsonb, text) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_token_mensaje(jsonb) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_validar_proyeccion(jsonb, integer, text, text, text, text, jsonb) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_sanear_proyeccion(jsonb) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_clasificar_recepcion_r05(jsonb, text) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_cotejar(jsonb, jsonb, boolean, boolean) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_procesar_proyeccion(jsonb, integer, text, text, text, text, jsonb, jsonb, boolean, boolean) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_exigir_activo() FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_preparar(uuid, uuid, uuid) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_hash_testigo(text) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_operacion(uuid, uuid, uuid, uuid, text) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_no_vigente(uuid, uuid, uuid, text) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_token_rechazado_post1(uuid, uuid, uuid) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_posts(uuid, uuid, uuid) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_ultima_actividad(uuid, uuid, uuid) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_abiertas(timestamptz) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_derivar_cierre(uuid, uuid, uuid) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_e03_r05() FROM nexit_runtime;

  REVOKE ALL ON public.nex_e03_r05_estado FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_operaciones_r05 FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_posts_grandes_r05 FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_autenticaciones_r05 FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_proyecciones_r05 FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_cierres_r05 FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_salidas_tardias_r05 FROM nexit_runtime;
  GRANT SELECT ON public.nex_e03_r05_estado TO nexit_runtime;
  GRANT SELECT (operacion_id, empresa_id, documento_id, version, correlacion_id, actor_id, confirma_rechazo, conexion, payload_hash, creado_at)
    ON public.documento_electronico_envio_operaciones_r05 TO nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_posts_grandes_r05 TO nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_autenticaciones_r05 TO nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_proyecciones_r05 TO nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_cierres_r05 TO nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_salidas_tardias_r05 TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_e03_operacion_por_correlacion_r05(uuid, uuid, uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_e03_conexion_referencia_r05(uuid, uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_e03_estado_operacion_r05(uuid, uuid, uuid, uuid) TO nexit_runtime;

  SELECT modo INTO v_modo FROM public.nex_e03_r05_estado WHERE id;
  IF v_modo = 'ACTIVO' THEN
    GRANT EXECUTE ON FUNCTION public.fe_e03_iniciar_envio_r05(uuid, uuid, uuid, boolean, uuid, text, jsonb) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_autenticacion_r05(uuid, uuid, uuid, uuid, text, text, text, text, integer) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_post_r05(uuid, uuid, uuid, uuid, text, smallint, text) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_salida_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_no_transmitido_r05(uuid, uuid, uuid, uuid, text, text) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_cerrar_envio_r05(uuid, uuid, uuid, uuid, text, jsonb) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_salida_tardia_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) TO nexit_runtime;
  ELSE
    REVOKE ALL ON FUNCTION public.fe_e03_iniciar_envio_r05(uuid, uuid, uuid, boolean, uuid, text, jsonb) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_autenticacion_r05(uuid, uuid, uuid, uuid, text, text, text, text, integer) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_post_r05(uuid, uuid, uuid, uuid, text, smallint, text) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_no_transmitido_r05(uuid, uuid, uuid, uuid, text, text) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_cerrar_envio_r05(uuid, uuid, uuid, uuid, text, jsonb) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_tardia_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) FROM nexit_runtime;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_e03_r05() FROM PUBLIC;
COMMENT ON FUNCTION public.nex_aplicar_grants_facturacion_e03_r05() IS 'NEX-084 + NEX-085 (F-VM-084-01): privilegios R05 por modo (3 lecturas siempre, 7 escrituras solo en ACTIVO, SELECT sin testigo) y revocación explícita de EXECUTE de nexit_runtime en los 31 auxiliares internos de NEX-084 y en este ayudante, reimpuesta tras cada nex_aplicar_grants_runtime().';

-- 3) Aplicar ahora (el runner vuelve a ejecutar el wrapper completo al final; el ayudante repite la revocación tras la base).
SELECT public.nex_aplicar_grants_facturacion_e03_r05();

-- 4) Comprobación en la misma transacción (solo si el rol existe): ningún auxiliar interno con EXECUTE efectivo de runtime, ni de PUBLIC; lecturas y escrituras según modo.
DO $$
DECLARE
  v_internas text[] := ARRAY[
    'public.nex_e03_r05_estado_guarda()', 'public.fe_e03_r05_operacion_inicio_guarda()', 'public.fe_e03_r05_evidencia_guarda()', 'public.fe_e03_r05_post_grande_guarda()',
    'public.fe_e03_r05_claves_exactas(jsonb,text[])', 'public.fe_e03_r05_bool(jsonb)', 'public.fe_e03_r05_entero(jsonb,numeric,numeric)',
    'public.fe_e03_r05_texto(jsonb,integer,boolean)', 'public.fe_e03_r05_enum(jsonb,text[])', 'public.fe_e03_r05_lote_valido(text)', 'public.fe_e03_r05_lote_nex080(text)',
    'public.fe_e03_r05_alterado(jsonb)', 'public.fe_e03_r05_astral(text)', 'public.fe_e03_r05_trim_js(text)', 'public.fe_e03_r05_clase_eco(text,jsonb,jsonb,text)',
    'public.fe_e03_r05_token_mensaje(jsonb)', 'public.fe_e03_r05_validar_proyeccion(jsonb,integer,text,text,text,text,jsonb)', 'public.fe_e03_r05_sanear_proyeccion(jsonb)',
    'public.fe_e03_clasificar_recepcion_r05(jsonb,text)', 'public.fe_e03_r05_cotejar(jsonb,jsonb,boolean,boolean)',
    'public.fe_e03_r05_procesar_proyeccion(jsonb,integer,text,text,text,text,jsonb,jsonb,boolean,boolean)', 'public.fe_e03_r05_exigir_activo()',
    'public.fe_e03_r05_preparar(uuid,uuid,uuid)', 'public.fe_e03_r05_hash_testigo(text)', 'public.fe_e03_r05_operacion(uuid,uuid,uuid,uuid,text)',
    'public.fe_e03_r05_no_vigente(uuid,uuid,uuid,text)', 'public.fe_e03_r05_token_rechazado_post1(uuid,uuid,uuid)', 'public.fe_e03_r05_posts(uuid,uuid,uuid)',
    'public.fe_e03_r05_ultima_actividad(uuid,uuid,uuid)', 'public.fe_e03_r05_abiertas(timestamptz)', 'public.fe_e03_r05_derivar_cierre(uuid,uuid,uuid)',
    'public.nex_aplicar_grants_facturacion_e03_r05()'];
  v_lecturas text[] := ARRAY['public.fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid)', 'public.fe_e03_estado_operacion_r05(uuid,uuid,uuid,uuid)',
    'public.fe_e03_conexion_referencia_r05(uuid,uuid,uuid)'];
  v_escrituras text[] := ARRAY['public.fe_e03_iniciar_envio_r05(uuid,uuid,uuid,boolean,uuid,text,jsonb)',
    'public.fe_e03_registrar_autenticacion_r05(uuid,uuid,uuid,uuid,text,text,text,text,integer)', 'public.fe_e03_registrar_post_r05(uuid,uuid,uuid,uuid,text,smallint,text)',
    'public.fe_e03_registrar_salida_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)',
    'public.fe_e03_registrar_no_transmitido_r05(uuid,uuid,uuid,uuid,text,text)', 'public.fe_e03_cerrar_envio_r05(uuid,uuid,uuid,uuid,text,jsonb)',
    'public.fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)'];
  v_desvios text[];
  v_modo text;
BEGIN
  SELECT array_agg(f ORDER BY f) INTO v_desvios FROM unnest(v_internas || v_lecturas || v_escrituras) AS f
   WHERE EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  WHERE p.oid = to_regprocedure(f) AND a.grantee = 0 AND a.privilege_type = 'EXECUTE');
  IF v_desvios IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-085: PUBLIC conserva EXECUTE en: %', array_to_string(v_desvios, ', ') USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  SELECT modo INTO v_modo FROM public.nex_e03_r05_estado WHERE id;

  SELECT array_agg(f ORDER BY f) INTO v_desvios FROM unnest(v_internas) AS f
   WHERE has_function_privilege('nexit_runtime', to_regprocedure(f), 'EXECUTE');
  IF v_desvios IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-085: nexit_runtime conserva EXECUTE efectivo en auxiliares internos: %', array_to_string(v_desvios, ', ') USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(f ORDER BY f) INTO v_desvios FROM unnest(v_lecturas) AS f
   WHERE NOT has_function_privilege('nexit_runtime', to_regprocedure(f), 'EXECUTE');
  IF v_desvios IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-085: nexit_runtime perdió EXECUTE en lecturas R05: %', array_to_string(v_desvios, ', ') USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(f ORDER BY f) INTO v_desvios FROM unnest(v_escrituras) AS f
   WHERE has_function_privilege('nexit_runtime', to_regprocedure(f), 'EXECUTE') IS DISTINCT FROM (v_modo = 'ACTIVO');
  IF v_desvios IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-085: EXECUTE de escrituras R05 no coincide con el modo %: %', v_modo, array_to_string(v_desvios, ', ') USING ERRCODE = 'P0001';
  END IF;
END $$;
