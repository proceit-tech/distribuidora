-- =====================================================================
-- NEX-022 — Clientes: razón social y nombre de fantasía hasta 255 caracteres (D211 / D212 del SIFEN).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Aplicar con documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- Antes: scripts/preinspeccion-NEX-022-023.sql (solo lectura). Reversión: scripts/reversion-NEX-022-023.sql.
--
-- PostgreSQL no permite ALTER COLUMN ... TYPE en columnas usadas por vistas (aunque solo se amplíe el varchar).
-- Las vistas que leen clientes.razon_social / clientes.nombre_fantasia (hoy v_movimientos_detalle y
-- v_ventas_al_costo, NEX-011, y las que dependan de ellas) se DETECTAN en el catálogo en el momento de aplicar
-- (sin copiar definiciones del Git, para no depender de drift), se guardan con su definición, propietario,
-- opciones (security_invoker), comentario y privilegios, se eliminan en orden inverso de dependencia, se amplían
-- las columnas y se recrean en el orden directo restaurando propietario, opciones, comentario y GRANTs.
-- Si algo no se puede restaurar, la transacción completa se revierte sin cambios. No toca filas.
-- No cubre: vistas materializadas (aborta si existieran) ni privilegios por columna (no se usan).
-- =====================================================================

DO $$
DECLARE
  r record;
  v_ddl text;
BEGIN
  IF to_regclass('public.clientes') IS NULL THEN
    RAISE EXCEPTION 'NEX-022 abortada: no existe public.clientes.';
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

  IF EXISTS (SELECT 1 FROM nex022_vistas WHERE relkind = 'm') THEN
    RAISE EXCEPTION 'NEX-022 abortada: hay vistas materializadas que dependen de clientes; no soportadas por esta migración.';
  END IF;

  CREATE TEMP TABLE nex022_def ON COMMIT DROP AS
  SELECT t.nivel, n.nspname, c.relname, pg_get_userbyid(c.relowner) AS propietario,
         regexp_replace(pg_get_viewdef(c.oid, true), '[;[:space:]]+$', '') AS definicion,
         c.reloptions, obj_description(c.oid, 'pg_class') AS comentario, c.oid AS oid_vista
    FROM nex022_vistas t
    JOIN pg_class c ON c.oid = t.oid_vista
    JOIN pg_namespace n ON n.oid = c.relnamespace;

  CREATE TEMP TABLE nex022_grants ON COMMIT DROP AS
  SELECT d.nspname, d.relname, x.privilege_type, x.is_grantable,
         CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END AS receptor
    FROM nex022_def d
    JOIN pg_class c ON c.oid = d.oid_vista
    CROSS JOIN LATERAL aclexplode(c.relacl) x
   WHERE c.relacl IS NOT NULL;

  -- 1) Eliminar vistas, de las más dependientes a las menos.
  FOR r IN SELECT * FROM nex022_def ORDER BY nivel DESC, relname LOOP
    EXECUTE format('DROP VIEW %I.%I', r.nspname, r.relname);
  END LOOP;

  -- 2) Ampliar columnas (solo cambia el máximo; los datos no se tocan).
  ALTER TABLE public.clientes
    ALTER COLUMN razon_social TYPE varchar(255),
    ALTER COLUMN nombre_fantasia TYPE varchar(255);

  -- 3) Recrear vistas, de las menos dependientes a las más, y restaurar propietario/comentario/privilegios.
  FOR r IN SELECT * FROM nex022_def ORDER BY nivel ASC, relname LOOP
    v_ddl := format('CREATE VIEW %I.%I %s AS %s', r.nspname, r.relname,
                    CASE WHEN r.reloptions IS NULL THEN '' ELSE 'WITH (' || array_to_string(r.reloptions, ', ') || ')' END,
                    r.definicion);
    EXECUTE v_ddl;
    IF r.propietario <> current_user THEN
      EXECUTE format('ALTER VIEW %I.%I OWNER TO %I', r.nspname, r.relname, r.propietario);
    END IF;
    IF r.comentario IS NOT NULL THEN
      EXECUTE format('COMMENT ON VIEW %I.%I IS %L', r.nspname, r.relname, r.comentario);
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM nex022_grants LOOP
    EXECUTE format('GRANT %s ON %I.%I TO %s%s', r.privilege_type, r.nspname, r.relname, r.receptor,
                   CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  -- 4) Verificación final dentro de la misma transacción (si falla, se revierte todo).
  FOR r IN SELECT * FROM nex022_def LOOP
    IF to_regclass(format('%I.%I', r.nspname, r.relname)) IS NULL THEN
      RAISE EXCEPTION 'NEX-022 abortada: no se pudo recrear la vista %.%.', r.nspname, r.relname;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'clientes'
         AND column_name IN ('razon_social', 'nombre_fantasia') AND character_maximum_length = 255) <> 2 THEN
    RAISE EXCEPTION 'NEX-022 abortada: las columnas no quedaron en varchar(255).';
  END IF;
END
$$;
