-- =====================================================================
-- REVERSIÓN manual de NEX-022 y NEX-023 (NO es una migración: no está en migraciones/ y el runner no la ejecuta).
-- Ejecutar SOLO con autorización del responsable, con backup, en una transacción:  psql -1 -f reversion-NEX-022-023.sql
-- Después hay que borrar las filas 'NEX-022' y 'NEX-023' de schema_migrations (decisión del responsable) para poder reaplicarlas.
-- 1) NEX-023: elimina el índice único de Innominado.
-- 2) NEX-022: devuelve razon_social y nombre_fantasia a varchar(200) con el mismo procedimiento de vistas;
--    ABORTA si existe algún valor de más de 200 caracteres (nunca trunca datos).
-- =====================================================================
DROP INDEX IF EXISTS public.clientes_empresa_innominado_key;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.clientes WHERE length(razon_social) > 200 OR length(nombre_fantasia) > 200) THEN
    RAISE EXCEPTION 'Reversión abortada: hay razón social o nombre de fantasía con más de 200 caracteres (no se trunca).';
  END IF;
END
$$;

DO $$
DECLARE
  r record;
  v_ddl text;
  v_oid regclass;
  v_cuenta integer;
BEGIN
  IF to_regclass('public.clientes') IS NULL THEN
    RAISE EXCEPTION 'Reversión NEX-022 abortada: no existe public.clientes.';
  END IF;

  -- Vistas (y vistas dependientes de vistas) que leen las dos columnas.
  CREATE TEMP TABLE nex022_vistas ON COMMIT DROP AS
  WITH RECURSIVE dep(oid_vista, relkind, nivel) AS (
    SELECT DISTINCT c.oid, c.relkind, 1
      FROM pg_depend d
      JOIN pg_rewrite rw ON rw.oid = d.objid
      JOIN pg_class c ON c.oid = rw.ev_class
      JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
     WHERE d.classid = 'pg_rewrite'::regclass
       AND d.refclassid = 'pg_class'::regclass
       AND d.refobjid = 'public.clientes'::regclass
       AND a.attname IN ('razon_social', 'nombre_fantasia')
       AND c.relkind IN ('v', 'm')
    UNION
    SELECT c2.oid, c2.relkind, dep.nivel + 1
      FROM dep
      JOIN pg_depend d2 ON d2.refobjid = dep.oid_vista AND d2.classid = 'pg_rewrite'::regclass AND d2.refclassid = 'pg_class'::regclass
      JOIN pg_rewrite rw2 ON rw2.oid = d2.objid
      JOIN pg_class c2 ON c2.oid = rw2.ev_class
     WHERE c2.oid <> dep.oid_vista AND c2.relkind IN ('v', 'm')
  )
  SELECT oid_vista, relkind, max(nivel) AS nivel FROM dep GROUP BY oid_vista, relkind;

  -- (1) Bloqueos previos: nada de esto se puede recrear con fidelidad.
  IF EXISTS (SELECT 1 FROM nex022_vistas WHERE relkind = 'm') THEN
    RAISE EXCEPTION 'Reversión NEX-022 abortada: hay vistas materializadas que dependen de clientes; no soportadas por esta migración.';
  END IF;
  SELECT count(*) INTO v_cuenta FROM nex022_vistas t WHERE EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = t.oid_vista AND NOT g.tgisinternal);
  IF v_cuenta > 0 THEN RAISE EXCEPTION 'Reversión NEX-022 abortada: % vista(s) dependiente(s) tienen triggers.', v_cuenta; END IF;
  SELECT count(*) INTO v_cuenta FROM nex022_vistas t WHERE EXISTS (SELECT 1 FROM pg_rewrite w WHERE w.ev_class = t.oid_vista AND w.rulename <> '_RETURN');
  IF v_cuenta > 0 THEN RAISE EXCEPTION 'Reversión NEX-022 abortada: % vista(s) dependiente(s) tienen reglas adicionales.', v_cuenta; END IF;
  SELECT count(*) INTO v_cuenta FROM nex022_vistas t WHERE EXISTS (SELECT 1 FROM pg_attrdef x WHERE x.adrelid = t.oid_vista);
  IF v_cuenta > 0 THEN RAISE EXCEPTION 'Reversión NEX-022 abortada: % vista(s) dependiente(s) tienen valores por defecto en columnas.', v_cuenta; END IF;

  -- (2) Estado a restaurar y a verificar.
  CREATE TEMP TABLE nex022_def ON COMMIT DROP AS
  SELECT t.nivel, n.nspname, c.relname, pg_get_userbyid(c.relowner) AS propietario,
         pg_get_viewdef(c.oid, true) AS definicion,
         c.reloptions, obj_description(c.oid, 'pg_class') AS comentario, c.oid AS oid_vista,
         (SELECT array_agg(x::text ORDER BY x::text) FROM unnest(coalesce(c.relacl, acldefault('r', c.relowner))) x) AS acl_vista,
         (SELECT string_agg(a.attname || '=' || (SELECT string_agg(y::text, ',' ORDER BY y::text) FROM unnest(a.attacl) y), ';' ORDER BY a.attnum)
            FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attacl IS NOT NULL AND NOT a.attisdropped) AS acl_columnas
    FROM nex022_vistas t
    JOIN pg_class c ON c.oid = t.oid_vista
    JOIN pg_namespace n ON n.oid = c.relnamespace;

  CREATE TEMP TABLE nex022_grants ON COMMIT DROP AS
  SELECT d.nspname, d.relname, NULL::text AS columna, x.privilege_type, x.is_grantable,
         CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END AS receptor
    FROM nex022_def d
    JOIN pg_class c ON c.oid = d.oid_vista
    CROSS JOIN LATERAL aclexplode(c.relacl) x
   WHERE c.relacl IS NOT NULL
  UNION ALL
  SELECT d.nspname, d.relname, a.attname::text, x.privilege_type, x.is_grantable,
         CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END
    FROM nex022_def d
    JOIN pg_attribute a ON a.attrelid = d.oid_vista AND a.attacl IS NOT NULL AND NOT a.attisdropped
    CROSS JOIN LATERAL aclexplode(a.attacl) x;

  CREATE TEMP TABLE nex022_colcom ON COMMIT DROP AS
  SELECT d.nspname, d.relname, a.attname::text AS columna, col_description(d.oid_vista, a.attnum) AS comentario
    FROM nex022_def d JOIN pg_attribute a ON a.attrelid = d.oid_vista AND a.attnum > 0 AND NOT a.attisdropped
   WHERE col_description(d.oid_vista, a.attnum) IS NOT NULL;

  -- (3) Eliminar vistas, de las más dependientes a las menos. SIN CASCADE.
  FOR r IN SELECT * FROM nex022_def ORDER BY nivel DESC, relname LOOP
    EXECUTE format('DROP VIEW %I.%I', r.nspname, r.relname);
  END LOOP;

  -- Ampliar columnas (solo cambia el máximo; los datos no se tocan).
  ALTER TABLE public.clientes
    ALTER COLUMN razon_social TYPE varchar(200),
    ALTER COLUMN nombre_fantasia TYPE varchar(200);

  -- (4) Recrear vistas, de las menos dependientes a las más, y restaurar propietario / comentarios / privilegios.
  FOR r IN SELECT * FROM nex022_def ORDER BY nivel ASC, relname LOOP
    v_ddl := format('CREATE VIEW %I.%I %s AS %s', r.nspname, r.relname,
                    CASE WHEN r.reloptions IS NULL THEN '' ELSE 'WITH (' || array_to_string(r.reloptions, ', ') || ')' END,
                    regexp_replace(r.definicion, '[;[:space:]]+$', ''));
    EXECUTE v_ddl;
    IF r.propietario <> current_user THEN
      EXECUTE format('ALTER VIEW %I.%I OWNER TO %I', r.nspname, r.relname, r.propietario);
    END IF;
    IF r.comentario IS NOT NULL THEN
      EXECUTE format('COMMENT ON VIEW %I.%I IS %L', r.nspname, r.relname, r.comentario);
    END IF;
    -- Privilegios heredados de ALTER DEFAULT PRIVILEGES: revocar y dejar solo los guardados.
    EXECUTE format('REVOKE ALL ON %I.%I FROM PUBLIC', r.nspname, r.relname);
  END LOOP;

  -- Revocar a cada rol (no propietario) los privilegios heredados y reaplicar exactamente los guardados.
  FOR r IN
    SELECT DISTINCT d.nspname, d.relname, pg_get_userbyid(x.grantee) AS rol
      FROM nex022_def d
      JOIN pg_class c ON c.relname = d.relname AND c.relnamespace = d.nspname::regnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) x
     WHERE c.relacl IS NOT NULL AND x.grantee <> 0 AND x.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE ALL ON %I.%I FROM %I', r.nspname, r.relname, r.rol);
  END LOOP;

  FOR r IN SELECT * FROM nex022_grants WHERE columna IS NULL LOOP
    EXECUTE format('GRANT %s ON %I.%I TO %s%s', r.privilege_type, r.nspname, r.relname, r.receptor,
                   CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  FOR r IN SELECT * FROM nex022_grants WHERE columna IS NOT NULL LOOP
    EXECUTE format('GRANT %s (%I) ON %I.%I TO %s%s', r.privilege_type, r.columna, r.nspname, r.relname, r.receptor,
                   CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  FOR r IN SELECT * FROM nex022_colcom LOOP
    EXECUTE format('COMMENT ON COLUMN %I.%I.%I IS %L', r.nspname, r.relname, r.columna, r.comentario);
  END LOOP;

  -- (5) Verificación objetiva: cada vista debe quedar idéntica a la original (si no, se revierte TODO).
  FOR r IN SELECT * FROM nex022_def LOOP
    v_oid := to_regclass(format('%I.%I', r.nspname, r.relname));
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Reversión NEX-022 abortada: no se pudo recrear la vista %.%.', r.nspname, r.relname;
    END IF;
    IF pg_get_viewdef(v_oid, true) IS DISTINCT FROM r.definicion THEN
      RAISE EXCEPTION 'Reversión NEX-022 abortada: la definición de %.% cambió al recrearla.', r.nspname, r.relname;
    END IF;
    IF (SELECT c.reloptions FROM pg_class c WHERE c.oid = v_oid) IS DISTINCT FROM r.reloptions THEN
      RAISE EXCEPTION 'Reversión NEX-022 abortada: las opciones de %.% no coinciden.', r.nspname, r.relname;
    END IF;
    IF (SELECT pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid = v_oid) IS DISTINCT FROM r.propietario THEN
      RAISE EXCEPTION 'Reversión NEX-022 abortada: el propietario de %.% no coincide.', r.nspname, r.relname;
    END IF;
    IF obj_description(v_oid, 'pg_class') IS DISTINCT FROM r.comentario THEN
      RAISE EXCEPTION 'Reversión NEX-022 abortada: el comentario de %.% no coincide.', r.nspname, r.relname;
    END IF;
    IF (SELECT array_agg(x::text ORDER BY x::text) FROM pg_class c, LATERAL unnest(coalesce(c.relacl, acldefault('r', c.relowner))) x WHERE c.oid = v_oid) IS DISTINCT FROM r.acl_vista THEN
      RAISE EXCEPTION 'Reversión NEX-022 abortada: los privilegios de %.% no coinciden.', r.nspname, r.relname;
    END IF;
    IF (SELECT string_agg(a.attname || '=' || (SELECT string_agg(y::text, ',' ORDER BY y::text) FROM unnest(a.attacl) y), ';' ORDER BY a.attnum)
          FROM pg_attribute a WHERE a.attrelid = v_oid AND a.attacl IS NOT NULL AND NOT a.attisdropped) IS DISTINCT FROM r.acl_columnas THEN
      RAISE EXCEPTION 'Reversión NEX-022 abortada: los privilegios por columna de %.% no coinciden.', r.nspname, r.relname;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'clientes'
         AND column_name IN ('razon_social', 'nombre_fantasia') AND character_maximum_length = 200) <> 2 THEN
    RAISE EXCEPTION 'Reversión NEX-022 abortada: las columnas no quedaron en varchar(200).';
  END IF;
END
$$;
