-- Pre-inspección SOLO LECTURA para NEX-022 / NEX-023. No modifica nada.  Uso: psql -X -f preinspeccion-NEX-022-023.sql
-- CRITERIO OBJETIVO: la sección 3 (BLOQUEOS) debe devolver 0 en TODAS las filas y la sección 4 no debe listar duplicados.
-- Si hay cualquier valor distinto de 0, NO aplicar NEX-022/023: la propia migración abortaría, pero conviene saberlo antes.
-- Guardar la salida junto con el backup (permite comparar con el estado posterior).

\echo '== 1) Migraciones registradas (NEX-021 debe estar aplicada; NEX-022/023 no)'
SELECT version, aplicada_at FROM schema_migrations WHERE version >= 'NEX-020' ORDER BY version;

\echo '== 2) Columnas actuales (esperado antes: 200 y 200)'
SELECT column_name, data_type, character_maximum_length
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name IN ('razon_social', 'nombre_fantasia');

\echo '== 3a) Vistas que dependen de las columnas (comparar con NEX-011; drift = diferencias). tipo m = materializada (bloquea)'
CREATE TEMP TABLE pi_vistas AS
WITH RECURSIVE dep(oid_vista, relkind, nivel) AS (
  SELECT DISTINCT c.oid, c.relkind, 1
    FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid JOIN pg_class c ON c.oid = rw.ev_class
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
   WHERE d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass
     AND d.refobjid = 'public.clientes'::regclass AND a.attname IN ('razon_social', 'nombre_fantasia')
     AND c.relkind IN ('v', 'm')
  UNION
  SELECT c2.oid, c2.relkind, dep.nivel + 1
    FROM dep JOIN pg_depend d2 ON d2.refobjid = dep.oid_vista AND d2.classid = 'pg_rewrite'::regclass AND d2.refclassid = 'pg_class'::regclass
    JOIN pg_rewrite rw2 ON rw2.oid = d2.objid JOIN pg_class c2 ON c2.oid = rw2.ev_class
   WHERE c2.oid <> dep.oid_vista AND c2.relkind IN ('v', 'm')
)
SELECT oid_vista, relkind, max(nivel) AS nivel FROM dep GROUP BY oid_vista, relkind;

SELECT n.nspname AS esquema, c.relname AS vista, t.relkind AS tipo, t.nivel,
       pg_get_userbyid(c.relowner) AS propietario, c.reloptions AS opciones,
       coalesce(c.relacl::text, '(por defecto)') AS privilegios_vista,
       (SELECT string_agg(a.attname || '=' || a.attacl::text, '; ') FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attacl IS NOT NULL) AS privilegios_columna,
       obj_description(c.oid, 'pg_class') AS comentario
  FROM pi_vistas t JOIN pg_class c ON c.oid = t.oid_vista JOIN pg_namespace n ON n.oid = c.relnamespace
 ORDER BY t.nivel, c.relname;

\echo '== 3b) BLOQUEOS (todos deben ser 0)'
SELECT
  (SELECT count(*) FROM pi_vistas WHERE relkind = 'm')                                                                              AS vistas_materializadas,
  (SELECT count(*) FROM pi_vistas t WHERE EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = t.oid_vista AND NOT g.tgisinternal)) AS vistas_con_triggers,
  (SELECT count(*) FROM pi_vistas t WHERE EXISTS (SELECT 1 FROM pg_rewrite w WHERE w.ev_class = t.oid_vista AND w.rulename <> '_RETURN')) AS vistas_con_reglas,
  (SELECT count(*) FROM pi_vistas t WHERE EXISTS (SELECT 1 FROM pg_attrdef x WHERE x.adrelid = t.oid_vista))                         AS vistas_con_defaults,
  (SELECT count(*) FROM pg_depend dp JOIN pi_vistas t ON dp.refobjid = t.oid_vista
    WHERE dp.refclassid = 'pg_class'::regclass AND dp.deptype = 'n'
      AND dp.classid NOT IN ('pg_rewrite'::regclass, 'pg_type'::regclass))                                                          AS otros_objetos_dependen_de_las_vistas,
  (SELECT count(*) FROM pi_vistas t JOIN pg_class c ON c.oid = t.oid_vista
    WHERE pg_get_userbyid(c.relowner) <> current_user AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND r.rolsuper)) AS vistas_de_otro_propietario_sin_superusuario,
  (SELECT count(*) FROM pi_vistas)                                                                                                  AS total_vistas_a_recrear;
-- Nota: la última columna es informativa (no es un bloqueo); se espera 2 o más (v_movimientos_detalle, v_ventas_al_costo y dependientes).

\echo '== 3c) Objetos que usan los TIPOS DE FILA de esas vistas (funciones, columnas compuestas); DROP VIEW sin CASCADE fallaría si existen'
SELECT pg_describe_object(dp.classid, dp.objid, dp.objsubid) AS objeto_dependiente, c.relname AS vista
  FROM pi_vistas t JOIN pg_class c ON c.oid = t.oid_vista
  JOIN pg_depend dp ON dp.refclassid = 'pg_type'::regclass AND dp.refobjid = c.reltype AND dp.deptype = 'n'
 WHERE dp.classid <> 'pg_class'::regclass;

\echo '== 4) Clientes Innominado por empresa (NEX-023 exige como máximo 1 por empresa; listar duplicados)'
SELECT empresa_id, count(*) AS innominados FROM clientes WHERE tipo_documento = 'INNOMINADO' GROUP BY empresa_id HAVING count(*) > 1;

\echo '== 5) Informativo: longitudes actuales (NEX-022 no modifica datos)'
SELECT max(length(razon_social)) AS razon_max, max(length(nombre_fantasia)) AS fantasia_max FROM clientes;

\echo '== 6) Informativo: regularización fiscal legada (clientes que NO cumplen las reglas de aptitud SIFEN; ver docs/11-DICCIONARIO-CLIENTES.md)'
SELECT
  count(*) FILTER (WHERE naturaleza_receptor = 1 AND (numero_documento !~ '^[0-9]{3,8}$' OR dv IS NULL))          AS ruc_o_dv_invalido,
  count(*) FILTER (WHERE naturaleza_receptor = 2 AND length(numero_documento) > 20)                               AS documento_mayor_20,
  count(*) FILTER (WHERE length(razon_social) < 4)                                                                AS razon_social_menor_4,
  count(*) FILTER (WHERE nombre_fantasia IS NOT NULL AND length(nombre_fantasia) < 4)                             AS fantasia_menor_4,
  count(*) FILTER (WHERE email IS NOT NULL AND length(email) > 80)                                                AS email_mayor_80,
  count(*) FILTER (WHERE telefono IS NOT NULL AND length(telefono) NOT BETWEEN 6 AND 15)                          AS telefono_fuera_6_15,
  count(*) FILTER (WHERE celular IS NOT NULL AND length(celular) NOT BETWEEN 10 AND 20)                           AS celular_fuera_10_20
  FROM clientes;
