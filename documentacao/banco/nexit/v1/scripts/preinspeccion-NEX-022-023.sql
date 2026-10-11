-- Pre-inspección SOLO LECTURA para NEX-022 / NEX-023. No modifica nada.  Uso: psql -X -f preinspeccion-NEX-022-023.sql
-- CRITERIO OBJETIVO: la sección 3b (BLOQUEOS) debe devolver 0 (salvo la última columna informativa), la 3c sin filas y la 4 sin duplicados. La sección 6 es un diagnóstico de datos fiscales (ver su cobertura declarada), no un criterio de bloqueo.
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

\echo '== 6) Regularización fiscal: aptitud SIFEN de los clientes grabados (SOLO LECTURA)'
-- COBERTURA: replica en SQL las MISMAS condiciones de lib/fiscal/aptitud-sifen.ts (código desconocido de naturaleza/
-- operación, matriz natureza×operación, país×operación, tipo de persona, tipo de documento, RUC (3–8 dígitos) y DV
-- módulo 11, DV en no contribuyente, número de documento 1–20, descripción de Otro 9–41, Innominado (B2C, "0",
-- "Sin Nombre"), razón social 4–255, fantasía 4–255, e-mail 3–80, teléfono 6–15, celular 10–20 y domicilio fiscal:
-- D213 1–255, nro. de casa 1–6 dígitos, departamento/distrito/ciudad si la operación no es B2F, y B2F sin domicilio fiscal).
-- NO CUBRE (no se puede ni debe verificar en SQL): sintaxis completa del e-mail (solo longitud), existencia del RUC en
-- el Marangatu, estado del contribuyente ante la DNIT ni la política de emisión V2. "0 pendientes" significa
-- "sin inconsistencias internas detectables por estas reglas", NO "validado por la DNIT".
WITH f AS (
  SELECT c.id, c.empresa_id, c.codigo,
         c.naturaleza_receptor AS nat, c.tipo_operacion AS op, c.tipo_persona, c.pais_codigo, c.tipo_documento,
         c.numero_documento AS num, c.dv, c.descripcion_documento_identidad AS descr, c.razon_social AS razon,
         c.nombre_fantasia AS fantasia, c.email, c.telefono, c.celular,
         (SELECT d FROM direcciones_cliente d WHERE d.empresa_id = c.empresa_id AND d.cliente_id = c.id AND (d.es_fiscal OR d.tipo = 'FISCAL') LIMIT 1) AS fiscal
    FROM clientes c
), p AS (
  SELECT f.id, f.empresa_id, f.codigo,
    (nat NOT IN (1, 2))                                                                                    AS naturaleza_desconocida,
    (op NOT IN (1, 2, 3, 4))                                                                               AS operacion_desconocida,
    (nat = 1 AND op NOT IN (1, 2, 3)) OR (nat = 2 AND op NOT IN (2, 4))                                    AS matriz_invalida,
    (op = 4 AND pais_codigo = 'PRY') OR (op IN (1, 2, 3) AND pais_codigo IS DISTINCT FROM 'PRY')           AS pais_incompatible,
    (tipo_persona IS NULL OR tipo_persona NOT IN ('FISICA', 'JURIDICA'))                                  AS tipo_persona_invalido,
    (nat = 1 AND tipo_documento <> 'RUC')
      OR (nat = 2 AND tipo_documento NOT IN ('CEDULA_PARAGUAYA','PASAPORTE','CEDULA_EXTRANJERA','CARNET_RESIDENCIA','INNOMINADO','TARJETA_DIPLOMATICA','OTRO')) AS tipo_documento_invalido,
    (nat = 1 AND (num !~ '^[0-9]{3,8}$' OR dv IS NULL))                                                    AS ruc_formato_invalido,
    (nat = 1 AND num ~ '^[0-9]{3,8}$' AND dv IS DISTINCT FROM (
        SELECT (CASE WHEN s % 11 > 1 THEN 11 - s % 11 ELSE 0 END)::text
          FROM (SELECT sum(substr(num, g, 1)::int * (2 + length(num) - g)) AS s FROM generate_series(1, length(num)) g) q)) AS dv_incorrecto,
    (nat = 2 AND dv IS NOT NULL)                                                                           AS dv_en_no_contribuyente,
    (nat = 2 AND length(num) NOT BETWEEN 1 AND 20)                                                         AS documento_fuera_1_20,
    (tipo_documento = 'OTRO' AND (descr IS NULL OR length(descr) NOT BETWEEN 9 AND 41))                    AS descripcion_otro_fuera_9_41,
    (tipo_documento = 'INNOMINADO' AND (nat <> 2 OR op <> 2 OR num <> '0' OR lower(razon) <> 'sin nombre')) AS innominado_incorrecto,
    (length(razon) NOT BETWEEN 4 AND 255)                                                                  AS razon_fuera_4_255,
    (fantasia IS NOT NULL AND length(fantasia) NOT BETWEEN 4 AND 255)                                      AS fantasia_fuera_4_255,
    (email IS NOT NULL AND length(email) NOT BETWEEN 3 AND 80)                                             AS email_fuera_3_80,
    (telefono IS NOT NULL AND length(telefono) NOT BETWEEN 6 AND 15)                                       AS telefono_fuera_6_15,
    (celular IS NOT NULL AND length(celular) NOT BETWEEN 10 AND 20)                                        AS celular_fuera_10_20,
    (op = 4 AND (fiscal).id IS NULL)                                                                            AS b2f_sin_domicilio_fiscal,
    ((fiscal).id IS NOT NULL AND (length(btrim((fiscal).direccion)) NOT BETWEEN 1 AND 255))                     AS fiscal_direccion_fuera_1_255,
    ((fiscal).id IS NOT NULL AND coalesce((fiscal).numero_casa, '') !~ '^[0-9]{1,6}$')                          AS fiscal_numero_casa_invalido,
    ((fiscal).id IS NOT NULL AND op IS DISTINCT FROM 4
       AND ((fiscal).departamento_codigo IS NULL OR (fiscal).distrito_codigo IS NULL OR (fiscal).ciudad_codigo IS NULL)) AS fiscal_sin_geografia
    FROM f
)
SELECT count(*) AS clientes_total,
       count(*) FILTER (WHERE naturaleza_desconocida OR operacion_desconocida OR matriz_invalida OR pais_incompatible OR tipo_persona_invalido
                          OR tipo_documento_invalido OR ruc_formato_invalido OR dv_incorrecto OR dv_en_no_contribuyente OR documento_fuera_1_20
                          OR descripcion_otro_fuera_9_41 OR innominado_incorrecto OR razon_fuera_4_255 OR fantasia_fuera_4_255 OR email_fuera_3_80
                          OR telefono_fuera_6_15 OR celular_fuera_10_20 OR b2f_sin_domicilio_fiscal OR fiscal_direccion_fuera_1_255
                          OR fiscal_numero_casa_invalido OR fiscal_sin_geografia) AS clientes_con_pendientes,
       count(*) FILTER (WHERE naturaleza_desconocida) AS naturaleza_desconocida, count(*) FILTER (WHERE operacion_desconocida) AS operacion_desconocida,
       count(*) FILTER (WHERE matriz_invalida) AS matriz_invalida, count(*) FILTER (WHERE pais_incompatible) AS pais_incompatible,
       count(*) FILTER (WHERE tipo_persona_invalido) AS tipo_persona_invalido, count(*) FILTER (WHERE tipo_documento_invalido) AS tipo_documento_invalido,
       count(*) FILTER (WHERE ruc_formato_invalido) AS ruc_formato_invalido, count(*) FILTER (WHERE dv_incorrecto) AS dv_incorrecto,
       count(*) FILTER (WHERE dv_en_no_contribuyente) AS dv_en_no_contribuyente, count(*) FILTER (WHERE documento_fuera_1_20) AS documento_fuera_1_20,
       count(*) FILTER (WHERE descripcion_otro_fuera_9_41) AS descripcion_otro_fuera_9_41, count(*) FILTER (WHERE innominado_incorrecto) AS innominado_incorrecto,
       count(*) FILTER (WHERE razon_fuera_4_255) AS razon_fuera_4_255, count(*) FILTER (WHERE fantasia_fuera_4_255) AS fantasia_fuera_4_255,
       count(*) FILTER (WHERE email_fuera_3_80) AS email_fuera_3_80, count(*) FILTER (WHERE telefono_fuera_6_15) AS telefono_fuera_6_15,
       count(*) FILTER (WHERE celular_fuera_10_20) AS celular_fuera_10_20, count(*) FILTER (WHERE b2f_sin_domicilio_fiscal) AS b2f_sin_domicilio_fiscal,
       count(*) FILTER (WHERE fiscal_direccion_fuera_1_255) AS fiscal_direccion_fuera_1_255, count(*) FILTER (WHERE fiscal_numero_casa_invalido) AS fiscal_numero_casa_invalido,
       count(*) FILTER (WHERE fiscal_sin_geografia) AS fiscal_sin_geografia
  FROM p;
