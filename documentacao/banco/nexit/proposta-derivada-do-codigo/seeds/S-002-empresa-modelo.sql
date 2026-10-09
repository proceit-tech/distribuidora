-- =====================================================================
-- S-002 — Empresa-MODELO de la demostración (modelo C): código demo-modelo, datos 100 % ficticios.
-- Requiere: migraciones NEX-001..012 + semilla S-001.
-- La contraseña NO está aquí ni en Git: se entrega solo el HASH bcrypt ($2a$) generado con scripts/generar-hash-demo.sh:
--   psql -v usuario_demo=admin -v hash_demo="$HASH" -f S-002-empresa-modelo.sql
-- Idempotente: si demo-modelo ya existe no hace nada (para recrearla use demo_reiniciar / demo_eliminar).
-- =====================================================================
\if :{?hash_demo}
\else
  \echo 'FALTA -v hash_demo=<hash bcrypt $2a$ generado fuera del servidor>. Abortando.'
  \quit
\endif
\if :{?usuario_demo}
\else
  \set usuario_demo admin
\endif

SELECT CASE WHEN EXISTS (SELECT 1 FROM empresas WHERE codigo = 'demo-modelo')
            THEN 'demo-modelo ya existe: sin cambios'
            ELSE 'demo-modelo creada: ' || demo_crear_empresa('demo-modelo', 'Distribuidora Modelo (DEMO)', :'usuario_demo', :'hash_demo', 'MODELO', 3650)::text
       END AS resultado;
