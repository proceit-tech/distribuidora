-- =====================================================================
-- NEX-083 — FK de aislamiento referencial empresa_id → empresas(id) en las DOS tablas que T01-estructura.sql:38-45 detecta sin FK anclada (NEXIT-T01-FK-R02 / PRO-363 / PRO-62).
-- Orden: documentacao/ordens/ORD-CLAUDE-NEXIT-T01-FK-R02-NEX-083-DOS-FK-2026-11-23.md. Diagnóstico: documentacao/analises/NEXIT-T01-FK-R01-DIAGNOSTICO-FK-EMPRESA-2026-11-23.md
-- (detector de lectura: scripts/diagnostico-T01-FK-01.sql). Requiere NEX-065, NEX-081 y NEX-082 registradas en schema_migrations.
-- Incremental: NO edita NEX-001…082 ni sus checksums, ni T01-estructura.sql. NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo,
-- scripts/preflight-NEX-083.sql, ventana sin emisión). Verificación: scripts/verificar-NEX-083.sql. Reversión MANUAL: scripts/reversion-NEX-083.sql. ESTADO: versionada y NO aplicada.
--
-- Alcance EXACTO: dos FOREIGN KEY simples, VALIDADAS en esta misma transacción, sin NOT VALID, sin DML, sin índices, sin cambios de PK, funciones, triggers, grants ni RLS:
--   public.fe_estado_previo_nex065(empresa_id)         -> public.empresas(id)   constraint fe_estado_previo_nex065_empresa_fk
--       Foto de AUDITORÍA de NEX-065 (PK empresa_id, punto_id, tipo_documento). Conserva TODAS sus filas: no se exige vacía, se exige 0 huérfanos.
--   public.fe_stock_pendientes_preparacion(empresa_id) -> public.empresas(id)   constraint fe_stock_pendientes_preparacion_empresa_fk
--       Preparación INTERNA de una emisión con faltante (NEX-081; PK txid, empresa_id, clave). Se exige VACÍA bajo bloqueo (siempre vacía fuera de una emisión).
-- Acciones: ON UPDATE NO ACTION / ON DELETE NO ACTION, MATCH SIMPLE, NOT DEFERRABLE (iguales a las demás FK de empresa_id). No hay borrado de empresas en la aplicación; los únicos
-- DELETE de empresas versionados (demo_eliminar de NEX-012 y la limpieza V0 de ejecutar-pruebas.sh) actúan sobre empresas sin puntos de expedición. Una empresa con filas en la foto
-- NEX-065 tuvo fe_punto_secuencias, cuya FK a empresas y cuya guarda de inmutabilidad (NEX-060/063) ya impiden borrarla: la nueva FK no introduce un bloqueo nuevo.
-- Ninguna acción CASCADE/SET NULL: el historial de auditoría no se borra ni se altera.
--
-- Transacción: el runner (scripts/aplicar-migraciones.sh) ejecuta este archivo y su fila de schema_migrations (SHA-256) en UNA transacción psql -1. Por eso NO hay BEGIN/COMMIT aquí.
-- lock_timeout se fija con SET LOCAL (solo esta transacción). El bloque DO comprueba que el valor quedó vigente: fuera de una transacción explícita SET LOCAL no tiene efecto y la migración
-- ABORTA (no se ejecuta suelta, sin el registro del runner).
--
-- Bloqueos: ALTER TABLE … ADD FOREIGN KEY toma SHARE ROW EXCLUSIVE en la tabla hija y en la referida (empresas). Se toman PRIMERO y explícitamente, en el mismo orden que usa ALTER TABLE
-- (hijas antes que padre): fe_estado_previo_nex065 → fe_stock_pendientes_preparacion → empresas, ANTES de validar, y se mantienen hasta el COMMIT del runner. SHARE ROW EXCLUSIVE es
-- incompatible con INSERT/UPDATE/DELETE (ROW EXCLUSIVE): mientras dura, una emisión FE con faltante (escribe la preparación) o cualquier alta/edición de empresas espera; con
-- lock_timeout = 5s la MIGRACIÓN falla (y nada queda aplicado) en lugar de colgar la operación. Las lecturas y los FOR KEY SHARE de otras FK hacia empresas no se bloquean.
-- La validación recorre las dos hijas (la foto es pequeña; la preparación está vacía): ventana breve. Aplicación futura: ventana sin emisión FE/NCE, movimientos ni entradas de compra,
-- backup y preflight previos, autorizados por un humano aparte.
--
-- Gates FAIL-CLOSED (cualquiera aborta la transacción completa, sin instalación parcial):
--   G0 lock_timeout local vigente;  G1 schema_migrations: NEX-065/081/082 registradas con el checksum de sus archivos versionados, NEX-083 ausente y ninguna versión posterior;
--   G2 las dos tablas y empresas existen como tabla base (relkind 'r');  G3 rol ejecutor: dueño (o miembro del rol dueño) de las dos hijas y con privilegio REFERENCES en empresas;
--   G4 estructura exacta: columnas/tipos/NOT NULL de ambas tablas y su PK con el orden esperado; empresas.id uuid con PK de una sola columna;
--   G5 ninguna FK (de ningún tipo) en las dos tablas y ningún constraint con los nombres nuevos (estado parcial o instalación manual);
--   G6 inventario de T01 por catálogo: las tablas de public con empresa_id sin FK anclada (conkey[1] = empresa_id) son EXACTAMENTE estas dos;
--   G7 integridad: 0 empresa_id NULL y 0 huérfanos en la foto NEX-065; preparación NEX-081 VACÍA (bajo el bloqueo, sin escrituras concurrentes posibles).
-- Al final se verifica por catálogo la definición exacta y la validez (convalidated) de las dos FK, que la foto conserva su número de filas y que ninguna tabla queda incumpliendo T01.
-- =====================================================================
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t text;
  v_tablas constant text[] := ARRAY['fe_estado_previo_nex065', 'fe_stock_pendientes_preparacion'];
  v_n bigint;
  v_filas_foto bigint;
  v_lista text[];
BEGIN
  -- G0: transacción explícita con lock_timeout local corto
  IF current_setting('lock_timeout') <> '5s' THEN
    RAISE EXCEPTION 'NEX-083: lock_timeout local no vigente (%): aplicar SOLO con el runner oficial (transacción única psql -1).', current_setting('lock_timeout')
      USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_SIN_TRANSACCION';
  END IF;

  -- G1: control de migraciones (procedencia exacta de las tablas y de NEX-082)
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'NEX-083: falta public.schema_migrations (NEX-001).' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_DEPENDENCIA';
  END IF;
  IF (SELECT count(*) FROM public.schema_migrations
       WHERE (version = 'NEX-065' AND checksum = '24537d45e715fa0d90eac571423a29236a59c5a98bfbfccd13d60a0144de133c')
          OR (version = 'NEX-081' AND checksum = '2cf6bcec9033ddb12a2e59bf0376eeb7992787f2ee8811fd4dd50db7efd8359f')
          OR (version = 'NEX-082' AND checksum = 'c57c120cfbdeeb17e375d0834913a5a8c36d670f18a0ab6fed6eedf7b80c2165')) <> 3 THEN
    RAISE EXCEPTION 'NEX-083 requiere NEX-065, NEX-081 y NEX-082 registradas con el checksum de sus archivos versionados.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_DEPENDENCIA';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-083') THEN
    RAISE EXCEPTION 'NEX-083 ya está registrada en schema_migrations: no se reaplica por suposición.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_YA_REGISTRADA';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version ~ '^NEX-[0-9]{3}$' AND version > 'NEX-083') THEN
    RAISE EXCEPTION 'NEX-083: hay migraciones posteriores registradas: orden de aplicación inesperado.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_ORDEN';
  END IF;

  -- G2: tablas base existentes (antes de cualquier ::regclass)
  FOREACH t IN ARRAY v_tablas || 'empresas'::text LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = t AND c.relkind = 'r') THEN
      RAISE EXCEPTION 'NEX-083: public.% no existe como tabla base: no se instala en parte.', t USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_DEPENDENCIA';
    END IF;
  END LOOP;

  -- G3: rol ejecutor (comprobación, sin conceder nada)
  FOREACH t IN ARRAY v_tablas LOOP
    IF NOT pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = ('public.' || t)::regclass), 'USAGE') THEN
      RAISE EXCEPTION 'NEX-083: el rol % no es dueño de public.% (ALTER TABLE lo exige): ejecutar con el rol propietario del esquema.', current_user, t USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_ROL';
    END IF;
  END LOOP;
  IF NOT has_table_privilege(current_user, 'public.empresas', 'REFERENCES') THEN
    RAISE EXCEPTION 'NEX-083: el rol % no tiene REFERENCES sobre public.empresas.', current_user USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_ROL';
  END IF;

  -- Bloqueos ANTES de validar el resto (modo de ADD FOREIGN KEY: sin escalamiento), hijas antes que padre, orden fijo
  LOCK TABLE public.fe_estado_previo_nex065 IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.fe_stock_pendientes_preparacion IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.empresas IN SHARE ROW EXCLUSIVE MODE;

  -- G4: estructura exacta (columnas vivas en orden, tipos y NOT NULL; PK con su orden)
  IF ARRAY(SELECT a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
             FROM pg_attribute a WHERE a.attrelid = 'public.fe_estado_previo_nex065'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum)
     <> ARRAY['empresa_id uuid NOT NULL', 'punto_id uuid NOT NULL', 'tipo_documento text NOT NULL', 'punto_activo boolean NOT NULL',
              'secuencia_activo boolean NOT NULL', 'efectivo_previo boolean NOT NULL', 'migrado_at timestamp with time zone NOT NULL'] THEN
    RAISE EXCEPTION 'NEX-083: public.fe_estado_previo_nex065 no tiene la estructura de NEX-065: esquema distinto.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_ESTRUCTURA';
  END IF;
  IF ARRAY(SELECT a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
             FROM pg_attribute a WHERE a.attrelid = 'public.fe_stock_pendientes_preparacion'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum)
     <> ARRAY['txid bigint NOT NULL', 'empresa_id uuid NOT NULL', 'clave text NOT NULL', 'pendientes jsonb NOT NULL'] THEN
    RAISE EXCEPTION 'NEX-083: public.fe_stock_pendientes_preparacion no tiene la estructura de NEX-081: esquema distinto.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_ESTRUCTURA';
  END IF;
  IF (SELECT array_agg(pg_get_constraintdef(k.oid)) FROM pg_constraint k WHERE k.conrelid = 'public.fe_estado_previo_nex065'::regclass AND k.contype = 'p')
       IS DISTINCT FROM ARRAY['PRIMARY KEY (empresa_id, punto_id, tipo_documento)']
     OR (SELECT array_agg(pg_get_constraintdef(k.oid)) FROM pg_constraint k WHERE k.conrelid = 'public.fe_stock_pendientes_preparacion'::regclass AND k.contype = 'p')
       IS DISTINCT FROM ARRAY['PRIMARY KEY (txid, empresa_id, clave)'] THEN
    RAISE EXCEPTION 'NEX-083: la clave primaria de la foto NEX-065 o de la preparación NEX-081 no es la esperada.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_ESTRUCTURA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'public.empresas'::regclass AND a.attname = 'id' AND NOT a.attisdropped AND a.atttypid = 'uuid'::regtype)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = 'public.empresas'::regclass AND k.contype = 'p'
                      AND k.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'public.empresas'::regclass AND a.attname = 'id')]::int2[]) THEN
    RAISE EXCEPTION 'NEX-083: public.empresas(id) no es uuid con PK de una sola columna: no es referenciable como se espera.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_ESTRUCTURA';
  END IF;

  -- G5: ninguna FK previa en las dos tablas y ningún constraint con los nombres nuevos
  IF EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid IN ('public.fe_estado_previo_nex065'::regclass, 'public.fe_stock_pendientes_preparacion'::regclass) AND k.contype = 'f') THEN
    RAISE EXCEPTION 'NEX-083: la foto NEX-065 o la preparación NEX-081 ya tienen alguna FOREIGN KEY (instalación previa, manual o parcial): no se reaplica por suposición.'
      USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_PREEXISTENTE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint k WHERE k.connamespace = 'public'::regnamespace
               AND k.conname IN ('fe_estado_previo_nex065_empresa_fk', 'fe_stock_pendientes_preparacion_empresa_fk')) THEN
    RAISE EXCEPTION 'NEX-083: ya existe un constraint con el nombre fe_estado_previo_nex065_empresa_fk o fe_stock_pendientes_preparacion_empresa_fk.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_PREEXISTENTE';
  END IF;

  -- G6: inventario de T01 por catálogo (criterio de T01-estructura.sql:38-45, sin depender de privilegios de information_schema)
  SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}') INTO v_lista
    FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped AND a.attnum > 0
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relname <> 'empresas'
     AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'f' AND k.conkey[1] = a.attnum);
  IF v_lista <> ARRAY['fe_estado_previo_nex065', 'fe_stock_pendientes_preparacion'] THEN
    RAISE EXCEPTION 'NEX-083: las tablas con empresa_id sin FK anclada no son exactamente las dos del diagnóstico: %. Fuera de alcance: no se corrige en parte.', v_lista
      USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_INVENTARIO';
  END IF;

  -- G7: integridad de datos (sin mostrar valores; sin corregir nada)
  SELECT count(*) INTO v_filas_foto FROM public.fe_estado_previo_nex065;
  SELECT count(*) INTO v_n FROM public.fe_estado_previo_nex065 f WHERE f.empresa_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = f.empresa_id);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'NEX-083: la foto NEX-065 tiene % fila(s) con empresa_id nulo o sin empresa: no se corrige ni se borra historial; conciliar a mano.', v_n
      USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_HUERFANOS';
  END IF;
  SELECT count(*) INTO v_n FROM public.fe_stock_pendientes_preparacion;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'NEX-083: public.fe_stock_pendientes_preparacion tiene % fila(s); debe estar vacía fuera de una emisión (estado anómalo): no se instala.', v_n
      USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_PREPARACION_NO_VACIA';
  END IF;

  -- Instalación: las dos FK EXACTAS, validadas al crearlas (sin NOT VALID)
  ALTER TABLE public.fe_estado_previo_nex065
    ADD CONSTRAINT fe_estado_previo_nex065_empresa_fk FOREIGN KEY (empresa_id) REFERENCES public.empresas (id)
    MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION NOT DEFERRABLE;
  ALTER TABLE public.fe_stock_pendientes_preparacion
    ADD CONSTRAINT fe_stock_pendientes_preparacion_empresa_fk FOREIGN KEY (empresa_id) REFERENCES public.empresas (id)
    MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION NOT DEFERRABLE;

  -- Verificación interna: exactamente una FK por tabla, con la definición y validez esperadas
  SELECT count(*) INTO v_n FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
   WHERE c.relnamespace = 'public'::regnamespace AND k.contype = 'f' AND c.relname = ANY (v_tablas)
     AND k.conname = c.relname || '_empresa_fk' AND k.convalidated AND NOT k.condeferrable AND NOT k.condeferred
     AND k.confrelid = 'public.empresas'::regclass AND k.confupdtype = 'a' AND k.confdeltype = 'a' AND k.confmatchtype = 's'
     AND k.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'empresa_id')]::int2[]
     AND k.confkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'public.empresas'::regclass AND a.attname = 'id')]::int2[];
  IF v_n <> 2 OR (SELECT count(*) FROM pg_constraint k WHERE k.conrelid IN ('public.fe_estado_previo_nex065'::regclass, 'public.fe_stock_pendientes_preparacion'::regclass) AND k.contype = 'f') <> 2 THEN
    RAISE EXCEPTION 'NEX-083: la verificación posterior encontró % de 2 FK con la definición exacta y validadas.', v_n USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_VERIFICACION';
  END IF;
  IF (SELECT count(*) FROM public.fe_estado_previo_nex065) <> v_filas_foto THEN
    RAISE EXCEPTION 'NEX-083: la foto NEX-065 cambió de número de filas durante la migración.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_VERIFICACION';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped AND a.attnum > 0
              WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relname <> 'empresas'
                AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'f' AND k.conkey[1] = a.attnum)) THEN
    RAISE EXCEPTION 'NEX-083: tras instalar, alguna tabla con empresa_id sigue sin FK anclada (T01 seguiría fallando).' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX083_VERIFICACION';
  END IF;
  RAISE NOTICE 'NEX-083: 2 FK empresa_id → empresas(id) instaladas y validadas; foto NEX-065 intacta (% filas); preparación NEX-081 vacía.', v_filas_foto;
END $$;
