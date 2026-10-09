-- =====================================================================
-- S-003 — Empresa DEMO individual para un prospecto (modelo C): aislada de las demás y de cualquier dato real.
-- Variables obligatorias (-v):  codigo_demo (debe empezar con "demo-"), razon_social_demo, prospecto, hash_demo
-- Opcionales: usuario_demo (admin), dias_vigencia (30)
--   psql -v codigo_demo=demo-acme -v razon_social_demo="Acme (DEMO)" -v prospecto="Acme S.A." -v hash_demo="$HASH" -f S-003-empresa-prospecto.sql
-- Cada prospecto recibe el MISMO conjunto ficticio, en su propia empresa. Reinicio: SELECT demo_reiniciar('demo-acme');
-- Baja total: SELECT demo_eliminar('demo-acme');  (ambas solo operan sobre empresas es_demo = true)
-- =====================================================================
\if :{?codigo_demo}
\else
  \echo 'FALTA -v codigo_demo=demo-xxxx'
  \quit
\endif
\if :{?hash_demo}
\else
  \echo 'FALTA -v hash_demo=<hash bcrypt $2a$>'
  \quit
\endif
\if :{?usuario_demo}
\else
  \set usuario_demo admin
\endif
\if :{?dias_vigencia}
\else
  \set dias_vigencia 30
\endif
\if :{?razon_social_demo}
\else
  \set razon_social_demo 'Empresa DEMO'
\endif
\if :{?prospecto}
\else
  \set prospecto ''
\endif

SELECT demo_crear_empresa(:'codigo_demo', :'razon_social_demo', :'usuario_demo', :'hash_demo', NULLIF(:'prospecto', ''), :dias_vigencia) AS empresa_id;
